import { getTagged } from './deps/bp_logger.js';
import { Url } from './core/util/url.js';
import { Remuxer } from './core/remuxer/remuxer.js';
import DEFAULT_CLIENT from './client/rtsp/client.js';
import DEFAULT_TRANSPORT from './transport/websocket.js';
import SMediaError from './media_error';
import { MediaRecorder } from './recorder.js';

const Log = getTagged('wsp');

export class StreamType {
    static get HLS() { return 'hls'; }
    static get RTSP() { return 'rtsp'; }

    static isSupported(type) {
        return [StreamType.HLS, StreamType.RTSP].includes(type);
    }

    static fromUrl(url) {
        let parsed;
        try {
            parsed = Url.parse(url);
        } catch (e) {
            return null;
        }
        switch (parsed.protocol) {
            case 'rtsp':
                return StreamType.RTSP;
            case 'http':
            case 'https':
                if (url.indexOf('.m3u8') >= 0) {
                    return StreamType.HLS;
                } else {
                    return null;
                }
            default:
                return null;
        }
    }

    static fromMime(mime) {
        switch (mime) {
            case 'application/x-rtsp':
                return StreamType.RTSP;
            case 'application/vnd.apple.mpegurl':
            case 'application/x-mpegurl':
                return StreamType.HLS;
            default:
                return null;
        }
    }
}

export class WSPlayer {

    constructor(node, opts) {
        if (typeof node == typeof '') {
            this.player = document.getElementById(node);
        } else {
            this.player = node;
        }

        let modules = opts.modules || {
            client: DEFAULT_CLIENT,
            transport: {
                constructor: DEFAULT_TRANSPORT
            }
        };
        this.errorHandler = opts.errorHandler || null;
        this.infoHandler = opts.infoHandler || null;
        this.dataHandler = opts.dataHandler || null;
        this.queryCredentials = opts.queryCredentials || null;

        this.bufferDuration_ = opts.bufferDuration || 120;
        if (isNaN(this.bufferDuration_) || (this.bufferDuration_ <= 0)) {
            Log.warn("Expected number type for bufferDuration");
            this.bufferDuration_ = 120;
        }

        this.continuousRecording = new MediaRecorder(this, 'continuous');
        this.eventRecording = new MediaRecorder(this, 'event');
        this.continuousRecording.setFileLength(opts.continuousFileLength);
        this.eventRecording.setFileLength(opts.eventFileLength);

        this.modules = {};
        for (let module of modules) {
            let transport = module.transport || DEFAULT_TRANSPORT;
            let client = module.client || DEFAULT_CLIENT;
            if (transport.constructor.canTransfer(client.streamType())) {
                this.modules[client.streamType()] = {
                    client: client,
                    transport: transport
                }
            } else {
                Log.warn(`Client stream type ${client.streamType()} is incompatible with transport types [${transport.streamTypes().join(', ')}]. Skip`)
            }
        }

        this.type = StreamType.RTSP;
        this.url = null;
        if (opts.url && opts.type) {
            this.url = opts.url;
            this.type = opts.type;
        } else {
            if (!this._checkSource(this.player)) {
                for (let i = 0; i < this.player.children.length; ++i) {
                    if (this._checkSource(this.player.children[i])) {
                        break;
                    }
                }
            }
            // if (!this.url) {
            //      throw new Error('No playable endpoint found');
            // }
        }

        if (this.url) {
            this.setSource(this.url, this.type);
        }

        this.player.addEventListener('play', () => {
            this.continuousRecording.pause(false);
            this.eventRecording.pause(false);

            if (!this.isPlaying()) {
                this.client.start();
            }
        }, false);

        this.player.addEventListener('pause', () => {
            this.client.stop();
            this.continuousRecording.pause(true);
            this.eventRecording.pause(true);
        }, false);

        this.player.addEventListener('seeking', () => {
            if (this.player.buffered.length) {
                let bStart = this.player.buffered.start(0);
                let bEnd = this.player.buffered.end(0);
                let bDuration = bEnd - bStart;

                if (bDuration > 0 && (this.player.currentTime < bStart || this.player.currentTime > bEnd)) {
                    if (this.player.currentTime < bStart) {
                        this.player.currentTime = bStart;
                    }
                    else {
                        this.player.currentTime = bEnd - 1;
                    }
                }
            }
        }, false);

        this.player.addEventListener('abort', () => {
            // disconnect the transport when the player is closed
            this.client.stop();
            this.transport.disconnect().then(() => {
                this.client.destroy();
            });
        }, false);

        this.redirectNativeMediaErrors = opts.hasOwnProperty('redirectNativeMediaErrors') ?
            opts.redirectNativeMediaErrors : true;

        if (this.redirectNativeMediaErrors) {
            this.player.addEventListener('error', () => {
                this.error(this.player.error.code);
            }, false);
        }
    }

    // TODO: check native support

    isPlaying() {
        return !(this.player.paused || this.client.paused);
    }

    static canPlayWithModules(mimeType, modules) {

        let filteredModules = {};
        for (let module of modules) {
            let transport = module.transport || DEFAULT_TRANSPORT;
            let client = module.client || DEFAULT_CLIENT;
            if (transport.canTransfer(client.streamType())) {
                filteredModules[client.streamType()] = true;
            }
        }

        for (let type in filteredModules) {
            if (type == StreamType.fromMime(mimeType)) {
                return true;
            }
        }
        return false;
    }

    /// TODO: deprecate it?
    static canPlay(resource) {
        return StreamType.fromMime(resource.type) || StreamType.fromUrl(resource.src);
    }

    canPlayUrl(src) {
        let type = StreamType.fromUrl(src);
        return (type in this.modules);
    }

    _checkSource(src) {
        if (!src.dataset['ignore'] && src.src && !this.player.canPlayType(src.type) && (StreamType.fromMime(src.type) || StreamType.fromUrl(src.src))) {
            this.url = src.src;
            this.type = src.type ? StreamType.fromMime(src.type) : StreamType.fromUrl(src.src);
            return true;
        }
        return false;
    }

    async setSource(url, type) {
        if (this.transport) {
            if (this.client) {
                await this.client.detachTransport();
            }
            await this.transport.destroy();
        }
        try {
            this.endpoint = Url.parse(url);
        } catch (e) {
            this.error(SMediaError.MEDIA_ERR_SRC_NOT_SUPPORTED);
            return;
        }

        this.url = url;
        let transport = this.modules[type].transport;
        this.transport = new transport.constructor(this.endpoint, this.type, transport.options);
        this.transport.eventSource.addEventListener('error', (errorEvent) => {
            this.error(errorEvent.detail);
        });
        this.transport.eventSource.addEventListener('info', (infoEvent) => {
            this.info(infoEvent.detail)
        });

        let lastType = this.type;
        this.type = (StreamType.isSupported(type) ? type : false) || StreamType.fromMime(type);
        if (!this.type) {
            this.error(SMediaError.MEDIA_ERR_SRC_NOT_SUPPORTED);
            return;
        }

        if (lastType != this.type || !this.client) {
            if (this.client) {
                await this.client.destroy();
            }
            let client = this.modules[type].client;
            let opts = { errorHandler: this.errorHandler, flush: 200 };
            this.client = new client(opts);
        } else {
            this.client.reset();
        }

        if (this.queryCredentials) {
            this.client.queryCredentials = this.queryCredentials;
        }
        if (this.remuxer) {
            this.continuousRecording.dettachSource();
            this.eventRecording.dettachSource();
            this.remuxer.destroy();
            this.remuxer = null;
        }
        this.remuxer = new Remuxer(this.player);
        this.remuxer.MSE.bufferDuration = this.bufferDuration_;
        this.remuxer.attachClient(this.client);

        this.continuousRecording.attachSource(this.remuxer);
        this.eventRecording.attachSource(this.remuxer);

        this.client.attachTransport(this.transport);
        this.client.setSource(this.endpoint);

        if (this.player.autoplay) {
            this.start();
        }
    }

    set bufferDuration(duration) {
        if (this.remuxer && this.remuxer.MSE) {
            this.bufferDuration_ = duration;
            this.remuxer.MSE.bufferDuration = duration;
        }
    }

    get bufferDuration() {
        if (this.remuxer)
            return this.remuxer.MSE.bufferDuration;
        else
            return undefined;
    }

    error(err) {
        if (err !== undefined) {
            this.error_ = new SMediaError(err);
            if (this.errorHandler) {
                Log.error(this.error_.message);
                this.errorHandler(this.error_);
            }
        }
        return this.error_;
    }

    info(inf) {
        if (inf !== undefined) {
            if (this.infoHandler) {
                this.infoHandler(inf);
            }
        }
    }

    mediadata(data, prefix) {
        if (data !== undefined) {
            if (this.dataHandler) {
                this.dataHandler(data, prefix);
            }
        }
    }

    start() {
        if (this.client) {
            this.client.start().catch((e) => {
                if (this.errorHandler) {
                    this.errorHandler(e);
                }
            });
        }
    }

    stop() {
        if (this.client) {
            this.client.stop();
        }
    }

    async destroy() {
        if (this.transport) {
            if (this.client) {
                await this.client.detachTransport();
            }
            await this.transport.destroy();
        }
        if (this.client) {
            await this.client.destroy();
        }
        if (this.remuxer) {
            this.remuxer.destroy();
            this.remuxer = null;
        }

        this.continuousRecording.destroy();
        this.eventRecording.destroy();
    }

}
