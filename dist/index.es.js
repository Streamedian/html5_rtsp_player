// ERROR=0, WARN=1, LOG=2, DEBUG=3
const LogLevel = {
    Error: 0,
    Warn: 1,
    Log: 2,
    Debug: 3
};

let DEFAULT_LOG_LEVEL = LogLevel.Debug;

function setDefaultLogLevel(level) {
    DEFAULT_LOG_LEVEL = level;
}
class Logger {
    constructor(level = DEFAULT_LOG_LEVEL, tag) {
        this.tag = tag;
        this.setLevel(level);
    }
    
    setLevel(level) {
        this.level = level;
    }
    
    static get level_map() { return {
        [LogLevel.Debug]:'log',
        [LogLevel.Log]:'log',
        [LogLevel.Warn]:'warn',
        [LogLevel.Error]:'error'
    }};

    _log(lvl, args) {
        args = Array.prototype.slice.call(args);
        if (this.tag) {
            args.unshift(`[${this.tag}]`);
        }
        if (this.level>=lvl) console[Logger.level_map[lvl]].apply(console, args);
    }
    log(){
        this._log(LogLevel.Log, arguments);
    }
    debug(){
        this._log(LogLevel.Debug, arguments);
    }
    error(){
        this._log(LogLevel.Error, arguments);
    }
    warn(){
        this._log(LogLevel.Warn, arguments);
    }
}

const taggedLoggers = new Map();
function getTagged(tag) {
    if (!taggedLoggers.has(tag)) {
        taggedLoggers.set(tag, new Logger(DEFAULT_LOG_LEVEL, tag));
    }
    return taggedLoggers.get(tag);
}
const Log$b = new Logger();

class Url {
    static parse(url) {
        let ret = {};

        let urlparts = decodeURI(url).split(' ');
        url = urlparts.shift();
        ret.client = urlparts.join(' ');

        let regex = /^([^:]+):\/\/([^\/]+)(.*)$/;  //protocol, login, urlpath
        let result = regex.exec(url);

        if (!result) {
            throw new Error("bad url");
        }

        ret.full = url;
        ret.protocol = result[1];
        ret.urlpath = result[3];

        let parts = ret.urlpath.split('/');
        ret.basename = parts.pop().split(/\?|#/)[0];
        ret.basepath = parts.join('/');

        let loginSplit = result[2].split('@');
        let hostport = loginSplit[0].split(':');
        let userpass = [ null, null ];
        if (loginSplit.length === 2) {
            userpass = loginSplit[0].split(':');
            hostport = loginSplit[1].split(':');
        }

        ret.user = userpass[0];
        ret.pass = userpass[1];
        ret.host = hostport[0];
        ret.auth = (ret.user && ret.pass) ? `${ret.user}:${ret.pass}` : '';

        ret.port = (null == hostport[1]) ? Url.protocolDefaultPort(ret.protocol) : hostport[1];
        ret.portDefined = (null != hostport[1]);
        ret.location = `${ret.host}:${ret.port}`;

        if (ret.protocol == 'unix') {
            ret.socket = ret.port;
            ret.port = undefined;
        }

        return ret;
    }

    static full(parsed) {
        return `${parsed.protocol}://${parsed.location}/${parsed.urlpath}`;
    }

    static isAbsolute(url) {
        return /^[^:]+:\/\//.test(url);
    }

    static protocolDefaultPort(protocol) {
        switch (protocol) {
            case 'rtsp': return 554;
            case 'http': return 80;
            case 'https': return 443;
        }

        return 0;
    }
}

const listener = Symbol("event_listener");
const listeners = Symbol("event_listeners");

class DestructibleEventListener {
    constructor(eventListener) {
        this[listener] = eventListener;
        this[listeners] = new Map();
    }

    clear() {
        if (this[listeners]) {
            for (let entry of this[listeners]) {
                for (let fn of entry[1]) {
                    this[listener].removeEventListener(entry[0], fn);
                }
            }        }
        this[listeners].clear();
    }

    destroy() {
        this.clear();
        this[listeners] = null;
    }

    on(event, selector, fn) {
        if (fn == undefined) {
            fn = selector;
            selector = null;
        }
        if (selector) {
            return this.addEventListener(event, (e) => {
                if (e.target.matches(selector)) {
                    fn(e);
                }
            });
        } else {
            return this.addEventListener(event, fn);
        }
    }

    addEventListener(event, fn) {
        if (!this[listeners].has(event)) {
            this[listeners].set(event, new Set());
        }
        this[listeners].get(event).add(fn);
        this[listener].addEventListener(event, fn, false);
        return fn;
    }

    removeEventListener(event, fn) {
        this[listener].removeEventListener(event, fn, false);
        if (this[listeners].has(event)) {
            //this[listeners].set(event, new Set());
            let ev = this[listeners].get(event);
            ev.delete(fn);
            if (!ev.size) {
                this[listeners].delete(event);
            }
        }
    }

    dispatchEvent(event) {
        if (this[listener]) {
            this[listener].dispatchEvent(event);
        }
    }
}

class EventEmitter {
    constructor(element=null) {
        this[listener] = new DestructibleEventListener(element || document.createElement('div'));
    }

    clear() {
        if (this[listener]) {
            this[listener].clear();
        }
    }

    destroy() {
        if (this[listener]) {
            this[listener].destroy();
            this[listener] = null;
        }
    }

    on(event, selector, fn) {
        if (this[listener]) {
            return this[listener].on(event, selector, fn);
        }
        return null;
    }

    addEventListener(event, fn) {
        if (this[listener]) {
            return this[listener].addEventListener(event, fn, false);
        }
        return null;
    }

    removeEventListener(event, fn) {
        if (this[listener]) {
            this[listener].removeEventListener(event, fn, false);
        }
    }

    dispatchEvent(event, data) {
        if (this[listener]) {
            this[listener].dispatchEvent(new CustomEvent(event, {detail: data}));
        }
    }
}

class EventSourceWrapper {
    constructor(eventSource) {
        this.eventSource = eventSource;
        this[listeners] = new Map();
    }

    on(event, selector, fn) {
        if (!this[listeners].has(event)) {
            this[listeners].set(event, new Set());
        }
        let listener = this.eventSource.on(event, selector, fn);
        if (listener) {
            this[listeners].get(event).add(listener);
        }
    }

    off(event, fn){
        this.eventSource.removeEventListener(event, fn);
    }

    clear() {
        this.eventSource.clear();
        this[listeners].clear();
    }

    destroy() {
        this.eventSource.clear();
        this[listeners] = null;
        this.eventSource = null;
    }
}

/**
 * Generate MP4 Box
 * got from: https://github.com/dailymotion/hls.js
 */

class MP4 {
    static init() {
        MP4.types = {
            avc1: [], // codingname
            avcC: [],
            btrt: [],
            dinf: [],
            dref: [],
            esds: [],
            ftyp: [],
            hdlr: [],
            mdat: [],
            mdhd: [],
            mdia: [],
            mfhd: [],
            minf: [],
            moof: [],
            moov: [],
            mp4a: [],
            mvex: [],
            mvhd: [],
            sdtp: [],
            stbl: [],
            stco: [],
            stsc: [],
            stsd: [],
            stsz: [],
            stts: [],
            tfdt: [],
            tfhd: [],
            traf: [],
            trak: [],
            trun: [],
            trex: [],
            tkhd: [],
            vmhd: [],
            smhd: []
        };

        var i;
        for (i in MP4.types) {
            if (MP4.types.hasOwnProperty(i)) {
                MP4.types[i] = [
                    i.charCodeAt(0),
                    i.charCodeAt(1),
                    i.charCodeAt(2),
                    i.charCodeAt(3)
                ];
            }
        }

        var videoHdlr = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x00, // pre_defined
            0x76, 0x69, 0x64, 0x65, // handler_type: 'vide'
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x56, 0x69, 0x64, 0x65,
            0x6f, 0x48, 0x61, 0x6e,
            0x64, 0x6c, 0x65, 0x72, 0x00 // name: 'VideoHandler'
        ]);

        var audioHdlr = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x00, // pre_defined
            0x73, 0x6f, 0x75, 0x6e, // handler_type: 'soun'
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, 0x00, 0x00, // reserved
            0x53, 0x6f, 0x75, 0x6e,
            0x64, 0x48, 0x61, 0x6e,
            0x64, 0x6c, 0x65, 0x72, 0x00 // name: 'SoundHandler'
        ]);

        MP4.HDLR_TYPES = {
            'video': videoHdlr,
            'audio': audioHdlr
        };

        var dref = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x01, // entry_count
            0x00, 0x00, 0x00, 0x0c, // entry_size
            0x75, 0x72, 0x6c, 0x20, // 'url' type
            0x00, // version 0
            0x00, 0x00, 0x01 // entry_flags
        ]);

        var stco = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x00 // entry_count
        ]);

        MP4.STTS = MP4.STSC = MP4.STCO = stco;

        MP4.STSZ = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x00, // sample_size
            0x00, 0x00, 0x00, 0x00, // sample_count
        ]);
        MP4.VMHD = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x01, // flags
            0x00, 0x00, // graphicsmode
            0x00, 0x00,
            0x00, 0x00,
            0x00, 0x00 // opcolor
        ]);
        MP4.SMHD = new Uint8Array([
            0x00, // version
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, // balance
            0x00, 0x00 // reserved
        ]);

        MP4.STSD = new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x01]);// entry_count

        var majorBrand = new Uint8Array([105,115,111,109]); // isom
        var avc1Brand = new Uint8Array([97,118,99,49]); // avc1
        var minorVersion = new Uint8Array([0, 0, 0, 1]);

        MP4.FTYP = MP4.box(MP4.types.ftyp, majorBrand, minorVersion, majorBrand, avc1Brand);
        MP4.DINF = MP4.box(MP4.types.dinf, MP4.box(MP4.types.dref, dref));
    }

    static box(type, ...payload) {
        var size = 8,
            i = payload.length,
            len = i,
            result;
        // calculate the total size we need to allocate
        while (i--) {
            size += payload[i].byteLength;
        }
        result = new Uint8Array(size);
        result[0] = (size >> 24) & 0xff;
        result[1] = (size >> 16) & 0xff;
        result[2] = (size >> 8) & 0xff;
        result[3] = size  & 0xff;
        result.set(type, 4);
        // copy the payload into the result
        for (i = 0, size = 8; i < len; ++i) {
            // copy payload[i] array @ offset size
            result.set(payload[i], size);
            size += payload[i].byteLength;
        }
        return result;
    }

    static hdlr(type) {
        return MP4.box(MP4.types.hdlr, MP4.HDLR_TYPES[type]);
    }

    static mdat(data) {
        return MP4.box(MP4.types.mdat, data);
    }

    static mdhd(timescale, duration) {
        return MP4.box(MP4.types.mdhd, new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            0x00, 0x00, 0x00, 0x02, // creation_time
            0x00, 0x00, 0x00, 0x03, // modification_time
            (timescale >> 24) & 0xFF,
            (timescale >> 16) & 0xFF,
            (timescale >>  8) & 0xFF,
            timescale & 0xFF, // timescale
            (duration >> 24),
            (duration >> 16) & 0xFF,
            (duration >>  8) & 0xFF,
            duration & 0xFF, // duration
            0x55, 0xc4, // 'und' language (undetermined)
            0x00, 0x00
        ]));
    }

    static mdia(track) {
        return MP4.box(MP4.types.mdia, MP4.mdhd(track.timescale, track.duration), MP4.hdlr(track.type), MP4.minf(track));
    }

    static mfhd(sequenceNumber) {
        return MP4.box(MP4.types.mfhd, new Uint8Array([
            0x00,
            0x00, 0x00, 0x00, // flags
            (sequenceNumber >> 24),
            (sequenceNumber >> 16) & 0xFF,
            (sequenceNumber >>  8) & 0xFF,
            sequenceNumber & 0xFF, // sequence_number
        ]));
    }

    static minf(track) {
        if (track.type === 'audio') {
            return MP4.box(MP4.types.minf, MP4.box(MP4.types.smhd, MP4.SMHD), MP4.DINF, MP4.stbl(track));
        } else {
            return MP4.box(MP4.types.minf, MP4.box(MP4.types.vmhd, MP4.VMHD), MP4.DINF, MP4.stbl(track));
        }
    }

    static moof(sn, baseMediaDecodeTime, track) {
        return MP4.box(MP4.types.moof, MP4.mfhd(sn), MP4.traf(track,baseMediaDecodeTime));
    }
    /**
     * @param tracks... (optional) {array} the tracks associated with this movie
     */
    static moov(tracks, duration, timescale) {
        var
            i = tracks.length,
            boxes = [];

        while (i--) {
            boxes[i] = MP4.trak(tracks[i]);
        }

        return MP4.box.apply(null, [MP4.types.moov, MP4.mvhd(timescale, duration)].concat(boxes).concat(MP4.mvex(tracks)));
    }

    static mvex(tracks) {
        var
            i = tracks.length,
            boxes = [];

        while (i--) {
            boxes[i] = MP4.trex(tracks[i]);
        }
        return MP4.box.apply(null, [MP4.types.mvex].concat(boxes));
    }

    static mvhd(timescale,duration) {
        var
            bytes = new Uint8Array([
                0x00, // version 0
                0x00, 0x00, 0x00, // flags
                0x00, 0x00, 0x00, 0x01, // creation_time
                0x00, 0x00, 0x00, 0x02, // modification_time
                (timescale >> 24) & 0xFF,
                (timescale >> 16) & 0xFF,
                (timescale >>  8) & 0xFF,
                timescale & 0xFF, // timescale
                (duration >> 24) & 0xFF,
                (duration >> 16) & 0xFF,
                (duration >>  8) & 0xFF,
                duration & 0xFF, // duration
                0x00, 0x01, 0x00, 0x00, // 1.0 rate
                0x01, 0x00, // 1.0 volume
                0x00, 0x00, // reserved
                0x00, 0x00, 0x00, 0x00, // reserved
                0x00, 0x00, 0x00, 0x00, // reserved
                0x00, 0x01, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x01, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, // pre_defined
                0xff, 0xff, 0xff, 0xff // next_track_ID
            ]);
        return MP4.box(MP4.types.mvhd, bytes);
    }

    static sdtp(track) {
        var
            samples = track.samples || [],
            bytes = new Uint8Array(4 + samples.length),
            flags,
            i;
        // leave the full box header (4 bytes) all zero
        // write the sample table
        for (i = 0; i < samples.length; i++) {
            flags = samples[i].flags;
            bytes[i + 4] = (flags.dependsOn << 4) |
                (flags.isDependedOn << 2) |
                (flags.hasRedundancy);
        }

        return MP4.box(MP4.types.sdtp, bytes);
    }

    static stbl(track) {
        return MP4.box(MP4.types.stbl, MP4.stsd(track), MP4.box(MP4.types.stts, MP4.STTS), MP4.box(MP4.types.stsc, MP4.STSC), MP4.box(MP4.types.stsz, MP4.STSZ), MP4.box(MP4.types.stco, MP4.STCO));
    }

    static avc1(track) {
        var sps = [], pps = [], i, data, len;
        // assemble the SPSs

        for (i = 0; i < track.sps.length; i++) {
            data = track.sps[i];
            len = data.byteLength;
            sps.push((len >>> 8) & 0xFF);
            sps.push((len & 0xFF));
            sps = sps.concat(Array.prototype.slice.call(data)); // SPS
        }

        // assemble the PPSs
        for (i = 0; i < track.pps.length; i++) {
            data = track.pps[i];
            len = data.byteLength;
            pps.push((len >>> 8) & 0xFF);
            pps.push((len & 0xFF));
            pps = pps.concat(Array.prototype.slice.call(data));
        }

        var avcc = MP4.box(MP4.types.avcC, new Uint8Array([
                0x01,   // version
                sps[3], // profile
                sps[4], // profile compat
                sps[5], // level
                0xfc | 3, // lengthSizeMinusOne, hard-coded to 4 bytes
                0xE0 | track.sps.length // 3bit reserved (111) + numOfSequenceParameterSets
            ].concat(sps).concat([
                track.pps.length // numOfPictureParameterSets
            ]).concat(pps))), // "PPS"
            width = track.width,
            height = track.height;
        //console.log('avcc:' + Hex.hexDump(avcc));
        return MP4.box(MP4.types.avc1, new Uint8Array([
                0x00, 0x00, 0x00, // reserved
                0x00, 0x00, 0x00, // reserved
                0x00, 0x01, // data_reference_index
                0x00, 0x00, // pre_defined
                0x00, 0x00, // reserved
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, // pre_defined
                (width >> 8) & 0xFF,
                width & 0xff, // width
                (height >> 8) & 0xFF,
                height & 0xff, // height
                0x00, 0x48, 0x00, 0x00, // horizresolution
                0x00, 0x48, 0x00, 0x00, // vertresolution
                0x00, 0x00, 0x00, 0x00, // reserved
                0x00, 0x01, // frame_count
                0x12,
                0x62, 0x69, 0x6E, 0x65, //binelpro.ru
                0x6C, 0x70, 0x72, 0x6F,
                0x2E, 0x72, 0x75, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, // compressorname
                0x00, 0x18,   // depth = 24
                0x11, 0x11]), // pre_defined = -1
            avcc,
            MP4.box(MP4.types.btrt, new Uint8Array([
                0x00, 0x1c, 0x9c, 0x80, // bufferSizeDB
                0x00, 0x2d, 0xc6, 0xc0, // maxBitrate
                0x00, 0x2d, 0xc6, 0xc0])) // avgBitrate
        );
    }

    static esds(track) {
        var configlen = track.config.byteLength;
        let data = new Uint8Array(26+configlen+3);
        data.set([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags

            0x03, // descriptor_type
            0x17+configlen, // length
            0x00, 0x01, //es_id
            0x00, // stream_priority

            0x04, // descriptor_type
            0x0f+configlen, // length
            0x40, //codec : mpeg4_audio
            0x15, // stream_type
            0x00, 0x00, 0x00, // buffer_size
            0x00, 0x00, 0x00, 0x00, // maxBitrate
            0x00, 0x00, 0x00, 0x00, // avgBitrate

            0x05, // descriptor_type
            configlen
        ]);
        data.set(track.config, 26);
        data.set([0x06, 0x01, 0x02], 26+configlen);
        // return new Uint8Array([
        //     0x00, // version 0
        //     0x00, 0x00, 0x00, // flags
        //
        //     0x03, // descriptor_type
        //     0x17+configlen, // length
        //     0x00, 0x01, //es_id
        //     0x00, // stream_priority
        //
        //     0x04, // descriptor_type
        //     0x0f+configlen, // length
        //     0x40, //codec : mpeg4_audio
        //     0x15, // stream_type
        //     0x00, 0x00, 0x00, // buffer_size
        //     0x00, 0x00, 0x00, 0x00, // maxBitrate
        //     0x00, 0x00, 0x00, 0x00, // avgBitrate
        //
        //     0x05 // descriptor_type
        // ].concat([configlen]).concat(track.config).concat([0x06, 0x01, 0x02])); // GASpecificConfig)); // length + audio config descriptor
        return data;
    }

    static mp4a(track) {
        var audiosamplerate = track.audiosamplerate;
        return MP4.box(MP4.types.mp4a, new Uint8Array([
                0x00, 0x00, 0x00, // reserved
                0x00, 0x00, 0x00, // reserved
                0x00, 0x01, // data_reference_index
                0x00, 0x00, 0x00, 0x00,
                0x00, 0x00, 0x00, 0x00, // reserved
                0x00, track.channelCount, // channelcount
                0x00, 0x10, // sampleSize:16bits
                0x00, 0x00, // pre_defined
                0x00, 0x00, // reserved2
                (audiosamplerate >> 8) & 0xFF,
                audiosamplerate & 0xff, //
                0x00, 0x00]),
            MP4.box(MP4.types.esds, MP4.esds(track)));
    }

    static stsd(track) {
        if (track.type === 'audio') {
            return MP4.box(MP4.types.stsd, MP4.STSD, MP4.mp4a(track));
        } else {
            return MP4.box(MP4.types.stsd, MP4.STSD, MP4.avc1(track));
        }
    }

    static tkhd(track) {
        var id = track.id,
            duration = track.duration,
            width = track.width,
            height = track.height,
            volume = track.volume;
        return MP4.box(MP4.types.tkhd, new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x07, // flags
            0x00, 0x00, 0x00, 0x00, // creation_time
            0x00, 0x00, 0x00, 0x00, // modification_time
            (id >> 24) & 0xFF,
            (id >> 16) & 0xFF,
            (id >> 8) & 0xFF,
            id & 0xFF, // track_ID
            0x00, 0x00, 0x00, 0x00, // reserved
            (duration >> 24),
            (duration >> 16) & 0xFF,
            (duration >>  8) & 0xFF,
            duration & 0xFF, // duration
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, // reserved
            0x00, 0x00, // layer
            0x00, 0x00, // alternate_group
            (volume>>0)&0xff, (((volume%1)*10)>>0)&0xff, // track volume // FIXME
            0x00, 0x00, // reserved
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x40, 0x00, 0x00, 0x00, // transformation: unity matrix
            (width >> 8) & 0xFF,
            width & 0xFF,
            0x00, 0x00, // width
            (height >> 8) & 0xFF,
            height & 0xFF,
            0x00, 0x00 // height
        ]));
    }

    static traf(track,baseMediaDecodeTime) {
        var sampleDependencyTable = MP4.sdtp(track),
            id = track.id;
        return MP4.box(MP4.types.traf,
            MP4.box(MP4.types.tfhd, new Uint8Array([
                0x00, // version 0
                0x00, 0x00, 0x00, // flags
                (id >> 24),
                (id >> 16) & 0XFF,
                (id >> 8) & 0XFF,
                (id & 0xFF) // track_ID
            ])),
            MP4.box(MP4.types.tfdt, new Uint8Array([
                0x00, // version 0
                0x00, 0x00, 0x00, // flags
                (baseMediaDecodeTime >>24),
                (baseMediaDecodeTime >> 16) & 0XFF,
                (baseMediaDecodeTime >> 8) & 0XFF,
                (baseMediaDecodeTime & 0xFF) // baseMediaDecodeTime
            ])),
            MP4.trun(track,
                sampleDependencyTable.length +
                16 + // tfhd
                16 + // tfdt
                8 +  // traf header
                16 + // mfhd
                8 +  // moof header
                8),  // mdat header
            sampleDependencyTable);
    }

    /**
     * Generate a track box.
     * @param track {object} a track definition
     * @return {Uint8Array} the track box
     */
    static trak(track) {
        track.duration = track.duration || 0xffffffff;
        return MP4.box(MP4.types.trak, MP4.tkhd(track), MP4.mdia(track));
    }

    static trex(track) {
        var id = track.id;
        return MP4.box(MP4.types.trex, new Uint8Array([
            0x00, // version 0
            0x00, 0x00, 0x00, // flags
            (id >> 24),
            (id >> 16) & 0XFF,
            (id >> 8) & 0XFF,
            (id & 0xFF), // track_ID
            0x00, 0x00, 0x00, 0x01, // default_sample_description_index
            0x00, 0x00, 0x00, 0x00, // default_sample_duration
            0x00, 0x00, 0x00, 0x00, // default_sample_size
            0x00, 0x01, 0x00, 0x01 // default_sample_flags
        ]));
    }

    static trun(track, offset) {
        var samples= track.samples || [],
            len = samples.length,
            arraylen = 12 + (16 * len),
            array = new Uint8Array(arraylen),
            i,sample,duration,size,flags,cts;
        offset += 8 + arraylen;
        array.set([
            0x00, // version 0
            0x00, 0x0f, 0x01, // flags
            (len >>> 24) & 0xFF,
            (len >>> 16) & 0xFF,
            (len >>> 8) & 0xFF,
            len & 0xFF, // sample_count
            (offset >>> 24) & 0xFF,
            (offset >>> 16) & 0xFF,
            (offset >>> 8) & 0xFF,
            offset & 0xFF // data_offset
        ],0);
        for (i = 0; i < len; i++) {
            sample = samples[i];
            duration = sample.duration;
            size = sample.size;
            flags = sample.flags;
            cts = sample.cts;
            array.set([
                (duration >>> 24) & 0xFF,
                (duration >>> 16) & 0xFF,
                (duration >>> 8) & 0xFF,
                duration & 0xFF, // sample_duration
                (size >>> 24) & 0xFF,
                (size >>> 16) & 0xFF,
                (size >>> 8) & 0xFF,
                size & 0xFF, // sample_size
                (flags.isLeading << 2) | flags.dependsOn,
                (flags.isDependedOn << 6) |
                (flags.hasRedundancy << 4) |
                (flags.paddingValue << 1) |
                flags.isNonSync,
                flags.degradPrio & 0xF0 << 8,
                flags.degradPrio & 0x0F, // sample_flags
                (cts >>> 24) & 0xFF,
                (cts >>> 16) & 0xFF,
                (cts >>> 8) & 0xFF,
                cts & 0xFF // sample_composition_time_offset
            ],12+16*i);
        }
        return MP4.box(MP4.types.trun, array);
    }

    static initSegment(tracks, duration, timescale) {
        if (!MP4.types) {
            MP4.init();
        }
        var movie = MP4.moov(tracks, duration, timescale), result;
        result = new Uint8Array(MP4.FTYP.byteLength + movie.byteLength);
        result.set(MP4.FTYP);
        result.set(movie, MP4.FTYP.byteLength);
        return result;
    }
}

//import {MP4Inspect} from '../iso-bmff/mp4-inspector.js';

const LOG_TAG$5 = "mse";
const Log$a = getTagged(LOG_TAG$5);

class MSEBuffer {
    constructor(parent, codec) {
        this.mediaSource = parent.mediaSource;
        this.players = parent.players;
        this.cleaning = false;
        this.parent = parent;
        this.queue = [];
        this.cleanResolvers = [];
        this.codec = codec;
        this.cleanRanges = [];
        this.updatesToCleanup = 0;
        this.firstMoveToBufferStart = true;

        Log$a.debug(`Use codec: ${codec}`);

        this.sourceBuffer = this.mediaSource.addSourceBuffer(codec);
        this.eventSource = new EventEmitter(this.sourceBuffer);

        this.eventSource.addEventListener('updatestart', (e)=> {
            // this.updating = true;
            // Log.debug('update start');
            if (this.cleaning) {
                Log$a.debug(`${this.codec} cleaning start`);
            }
        });

        this.eventSource.addEventListener('update', (e)=> {
            // this.updating = true;
            if (this.cleaning) {
                Log$a.debug(`${this.codec} cleaning update`);
            }
        });

        this.eventSource.addEventListener('updateend', (e)=> {
            // Log.debug('update end');
            // this.updating = false;
            if (this.cleaning) {
                Log$a.debug(`${this.codec} cleaning end`);

                try {
                    if (this.sourceBuffer.buffered.length && this.players[0].currentTime < this.sourceBuffer.buffered.start(0)) {
                        this.players[0].currentTime = this.sourceBuffer.buffered.start(0);
                    }
                } catch (e) {
                    // TODO: do something?
                }
                while (this.cleanResolvers.length) {
                    let resolver = this.cleanResolvers.shift();
                    resolver();
                }
                this.cleaning = false;

                if (this.cleanRanges.length) {
                    this.doCleanup();
                    return;
                }
            }

            // cleanup buffer after 100 updates
            this.updatesToCleanup++;
            if(this.updatesToCleanup > 100){
                this.cleanupBuffer();
                this.updatesToCleanup = 0;
            }

            this.feedNext();
        });

        this.eventSource.addEventListener('error', (e)=> {
            Log$a.debug(`Source buffer error: ${this.mediaSource.readyState}`);
            if (this.mediaSource.sourceBuffers.length) {
                this.mediaSource.removeSourceBuffer(this.sourceBuffer);
            }
            this.parent.eventSource.dispatchEvent('error');
        });

        this.eventSource.addEventListener('abort', (e)=> {
            Log$a.debug(`Source buffer aborted: ${this.mediaSource.readyState}`);
            if (this.mediaSource.sourceBuffers.length) {
                this.mediaSource.removeSourceBuffer(this.sourceBuffer);
            }
            this.parent.eventSource.dispatchEvent('error');
        });

        if (!this.sourceBuffer.updating) {
            this.feedNext();
        }
        // TODO: cleanup every hour for live streams
    }

    cleanupBuffer(){
        if(this.sourceBuffer.buffered.length && !this.sourceBuffer.updating){
            let currentPlayTime   = this.players[0].currentTime;
            let startBuffered     = this.sourceBuffer.buffered.start(0);
            let endBuffered       = this.sourceBuffer.buffered.end(0);
            let bufferedDuration  = endBuffered - startBuffered;
            let removeEnd = endBuffered - this.parent.bufferDuration;

            if((removeEnd > 0) && (bufferedDuration > this.parent.bufferDuration) && (currentPlayTime > startBuffered) &&
                (currentPlayTime > removeEnd)){
                try {
                    Log$a.debug("Remove media segments", startBuffered, removeEnd);
                    this.sourceBuffer.remove(startBuffered, removeEnd);
                }
                catch (e){
                    Log$a.warn("Failed to cleanup buffer");
                }
            }
        }
    }

    destroy() {
        this.eventSource.destroy();
        this.clear();
        this.queue = [];
        this.mediaSource.removeSourceBuffer(this.sourceBuffer);
    }

    clear() {
        this.queue = [];
        let promises = [];
        for (let i=0; i< this.sourceBuffer.buffered.length; ++i) {
            // TODO: await remove
            this.cleaning = true;
            promises.push(new Promise((resolve, reject)=>{
                this.cleanResolvers.push(resolve);
                if (!this.sourceBuffer.updating) {
                    this.sourceBuffer.remove(this.sourceBuffer.buffered.start(i), this.sourceBuffer.buffered.end(i));
                    resolve();
                } else {
                    this.sourceBuffer.onupdateend = () => {
                        if (this.sourceBuffer) {
                            this.sourceBuffer.remove(this.sourceBuffer.buffered.start(i), this.sourceBuffer.buffered.end(i));
                        }
                        resolve();
                    };
                }
            }));
        }
        return Promise.all(promises);
    }

    setLive(is_live) {
        this.is_live = is_live;
    }

    feedNext() {
        // Log.debug("feed next ", this.sourceBuffer.updating);
        if (!this.sourceBuffer.updating && !this.cleaning && this.queue.length) {
            this.doAppend(this.queue.shift());
        }
    }

    doCleanup() {
        if (!this.cleanRanges.length) {
            this.cleaning = false;
            this.feedNext();
            return;
        }
        let range = this.cleanRanges.shift();
        Log$a.debug(`${this.codec} remove range [${range[0]} - ${range[1]}). 
                    \nUpdating: ${this.sourceBuffer.updating}
                    `);
        this.cleaning = true;
        this.sourceBuffer.remove(range[0], range[1]);
    }

    initCleanup() {
        if (this.sourceBuffer.buffered.length && !this.sourceBuffer.updating && !this.cleaning) {
            Log$a.debug(`${this.codec} cleanup`);
            let removeBound = this.sourceBuffer.buffered.end(this.sourceBuffer.buffered.length-1) - 2;

            for (let i=0; i< this.sourceBuffer.buffered.length; ++i) {
                let removeStart = this.sourceBuffer.buffered.start(i);
                let removeEnd = this.sourceBuffer.buffered.end(i);
                if ((this.players[0].currentTime <= removeStart) || (removeBound <= removeStart)) continue;

                if ((removeBound <= removeEnd) && (removeBound >= removeStart)) {
                    Log$a.debug(`Clear [${removeStart}, ${removeBound}), leave [${removeBound}, ${removeEnd}]`);
                    removeEnd = removeBound;
                    if (removeEnd!=removeStart) {
                        this.cleanRanges.push([removeStart, removeEnd]);
                    }
                    continue; // Do not cleanup buffered range after current position
                }
                this.cleanRanges.push([removeStart, removeEnd]);
            }

            this.doCleanup();

            // let bufferStart = this.sourceBuffer.buffered.start(0);
            // let removeEnd = this.sourceBuffer.buffered.start(0) + (this.sourceBuffer.buffered.end(0) - this.sourceBuffer.buffered.start(0))/2;
            // if (this.players[0].currentTime < removeEnd) {
            //     this.players[0].currentTime = removeEnd;
            // }
            // let removeEnd = Math.max(this.players[0].currentTime - 3, this.sourceBuffer.buffered.end(0) - 3);
            //
            // if (removeEnd < bufferStart) {
            //     removeEnd = this.sourceBuffer.buffered.start(0) + (this.sourceBuffer.buffered.end(0) - this.sourceBuffer.buffered.start(0))/2;
            //     if (this.players[0].currentTime < removeEnd) {
            //         this.players[0].currentTime = removeEnd;
            //     }
            // }

            // if (removeEnd > bufferStart && (removeEnd - bufferStart > 0.5 )) {
            //     // try {
            //         Log.debug(`${this.codec} remove range [${bufferStart} - ${removeEnd}).
            //         \nBuffered end: ${this.sourceBuffer.buffered.end(0)}
            //         \nUpdating: ${this.sourceBuffer.updating}
            //         `);
            //         this.cleaning = true;
            //         this.sourceBuffer.remove(bufferStart, removeEnd);
            //     // } catch (e) {
            //     //     // TODO: implement
            //     //     Log.error(e);
            //     // }
            // } else {
            //     this.feedNext();
            // }
        } else {
            this.feedNext();
        }
    }

    doAppend(data) {
        // console.log(MP4Inspect.mp4toJSON(data));
        let err = this.players[0].error;
        if (err) {
            Log$a.error(`Error occured: ${MSE.ErrorNotes[err.code]}`);
            try {
                this.players.forEach((video)=>{video.stop();});
                this.mediaSource.endOfStream();
            } catch (e){

            }
            this.parent.eventSource.dispatchEvent('error');
        } else {
            try {
                this.sourceBuffer.appendBuffer(data);
                if (this.firstMoveToBufferStart && this.sourceBuffer.buffered.length) {
                    this.players[0].currentTime = this.sourceBuffer.buffered.start(0);
                    if (this.players[0].autoPlay) {
                        this.players[0].start();
                    }
                    this.firstMoveToBufferStart = false;
                }
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    Log$a.debug(`${this.codec} quota fail`);
                    this.queue.unshift(data);
                    this.initCleanup();
                    return;
                }

                // reconnect on fail
                Log$a.error(`Error occured while appending buffer. ${e.name}: ${e.message}`);
                this.parent.eventSource.dispatchEvent('error');
            }
        }

    }

    feed(data) {
        this.queue = this.queue.concat(data);
        // Log.debug(this.sourceBuffer.updating, this.updating, this.queue.length);
        if (this.sourceBuffer && !this.sourceBuffer.updating && !this.cleaning) {
            // Log.debug('enq feed');
            this.feedNext();
        }
    }
}

class MSE {
    // static CODEC_AVC_BASELINE = "avc1.42E01E";
    // static CODEC_AVC_MAIN = "avc1.4D401E";
    // static CODEC_AVC_HIGH = "avc1.64001E";
    // static CODEC_VP8 = "vp8";
    // static CODEC_AAC = "mp4a.40.2";
    // static CODEC_VORBIS = "vorbis";
    // static CODEC_THEORA = "theora";

    static get ErrorNotes() {return  {
        [MediaError.MEDIA_ERR_ABORTED]: 'fetching process aborted by user',
        [MediaError.MEDIA_ERR_NETWORK]: 'error occurred when downloading',
        [MediaError.MEDIA_ERR_DECODE]: 'error occurred when decoding',
        [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: 'audio/video not supported'
    }};

    static isSupported(codecs) {
        return (window.MediaSource && window.MediaSource.isTypeSupported(`video/mp4; codecs="${codecs.join(',')}"`));
    }

    constructor (players) {
        this.players = players;
        const playing = this.players.map((video, idx) => {
            video.onplaying = function () {
                playing[idx] = true;
            };
            video.onpause = function () {
                playing[idx] = false;
            };
            return !video.paused;
        });
        this.playing = playing;
        this.mediaSource = new MediaSource();
        this.eventSource = new EventEmitter(this.mediaSource);
        this.reset();
    }

    set bufferDuration(buffDuration){
        this.bufferDuration_ = buffDuration;
    }

    get bufferDuration(){
        return this.bufferDuration_;
    }

    destroy() {
        this.reset();
        this.eventSource.destroy();
        this.mediaSource = null;
        this.eventSource = null;
    }

    play() {
        this.players.forEach((video, idx)=>{
            if (video.paused && !this.playing[idx]) {
                Log$a.debug(`player ${idx}: play`);
                video.play();
            }
        });
    }

    setLive(is_live) {
        for (let idx in this.buffers) {
            this.buffers[idx].setLive(is_live);
        }
        this.is_live = is_live;
    }

    resetBuffers() {
        this.players.forEach((video, idx)=>{
            if (!video.paused && this.playing[idx]) {
                video.pause();
                video.currentTime = 0;
            }
        });

        let promises = [];
        for (let buffer of this.buffers.values()) {
            promises.push(buffer.clear());
        }
        return Promise.all(promises).then(()=>{
            this.mediaSource.endOfStream();
            this.mediaSource.duration = 0;
            this.mediaSource.clearLiveSeekableRange();
            this.play();
        });
    }

    clear() {
        this.reset();
        this.players.forEach((video)=>{video.src = URL.createObjectURL(this.mediaSource);});

        return this.setupEvents();
    }

    setupEvents() {
        this.eventSource.clear();
        this.resolved = false;
        this.mediaReady = new Promise((resolve, reject)=> {
            this._sourceOpen = ()=> {
                Log$a.debug(`Media source opened: ${this.mediaSource.readyState}`);
                if (!this.resolved) {
                    this.resolved = true;
                    resolve();
                }
            };
            this._sourceEnded = ()=>{
                Log$a.debug(`Media source ended: ${this.mediaSource.readyState}`);
            };
            this._sourceClose = ()=>{
                Log$a.debug(`Media source closed: ${this.mediaSource.readyState}`);
                if (this.resolved) {
                    this.eventSource.dispatchEvent('sourceclosed');
                }
            };
            this.eventSource.addEventListener('sourceopen', this._sourceOpen);
            this.eventSource.addEventListener('sourceended', this._sourceEnded);
            this.eventSource.addEventListener('sourceclose', this._sourceClose);
        });
        return this.mediaReady;
    }

    reset() {
        this.ready = false;
        for (let track in this.buffers) {
            this.buffers[track].destroy();
            delete this.buffers[track];
        }
        if (this.mediaSource.readyState == 'open') {
            this.mediaSource.duration = 0;
            this.mediaSource.endOfStream();
        }
        this.updating = false;
        this.resolved = false;
        this.buffers = {};
        // this.players.forEach((video)=>{video.src = URL.createObjectURL(this.mediaSource)});
        // TODO: remove event listeners for existing media source
        // this.setupEvents();
        // this.clear();
    }

    setCodec(track, mimeCodec) {
        return this.mediaReady.then(()=>{
            this.buffers[track] = new MSEBuffer(this, mimeCodec);
            this.buffers[track].setLive(this.is_live);
        });
    }

    feed(track, data) {
        if (this.buffers[track]) {
            this.buffers[track].feed(data);
        }
    }
}

const Log$9 = getTagged('remuxer:base');
let track_id = 1;
class BaseRemuxer {

    static get MP4_TIMESCALE() { return 90000;}

    // TODO: move to ts parser
    // static PTSNormalize(value, reference) {
    //
    //     let offset;
    //     if (reference === undefined) {
    //         return value;
    //     }
    //     if (reference < value) {
    //         // - 2^33
    //         offset = -8589934592;
    //     } else {
    //         // + 2^33
    //         offset = 8589934592;
    //     }
    //     /* PTS is 33bit (from 0 to 2^33 -1)
    //      if diff between value and reference is bigger than half of the amplitude (2^32) then it means that
    //      PTS looping occured. fill the gap */
    //     while (Math.abs(value - reference) > 4294967296) {
    //         value += offset;
    //     }
    //     return value;
    // }

    static getTrackID() {
        return track_id++;
    }

    constructor(timescale, scaleFactor, params) {
        this.timeOffset = 0;
        this.timescale = timescale;
        this.scaleFactor = scaleFactor;
        this.readyToDecode = false;
        this.samples = [];
        this.seq = 1;
        this.tsAlign = 1;
    }

    scaled(timestamp) {
        return timestamp / this.scaleFactor;
    }

    unscaled(timestamp) {
        return timestamp * this.scaleFactor;
    }

    remux(unit) {
        if (unit) {
            this.samples.push({
                unit: unit,
                pts: unit.pts,
                dts: unit.dts
            });
            return true;
        }
        return false;
    }

    static toMS(timestamp) {
        return timestamp/90;
    }
    
    setConfig(config) {
        
    }

    insertDscontinuity() {
        this.samples.push(null);
    }

    init(initPTS, initDTS, shouldInitialize=true) {
        this.initPTS = Math.min(initPTS, this.samples[0].dts /*- this.unscaled(this.timeOffset)*/);
        this.initDTS = Math.min(initDTS, this.samples[0].dts /*- this.unscaled(this.timeOffset)*/);
        Log$9.debug(`Initial pts=${this.initPTS} dts=${this.initDTS} offset=${this.unscaled(this.timeOffset)}`);
        this.initialized = shouldInitialize;
    }

    flush() {
        this.seq++;
        this.mp4track.len = 0;
        this.mp4track.samples = [];
    }

    static dtsSortFunc(a,b) {
        return (a.dts-b.dts);
    }
	
	static groupByDts(gop) {
        const groupBy = (xs, key) => {
            return xs.reduce((rv, x) => {
                (rv[x[key]] = rv[x[key]] || []).push(x);
                return rv;
            }, {});
        };
        return groupBy(gop, 'dts');
    }

    getPayloadBase(sampleFunction, setupSample) {
        if (!this.readyToDecode || !this.initialized || !this.samples.length) return null;
        this.samples.sort(BaseRemuxer.dtsSortFunc);
        return true;
        //
        // let payload = new Uint8Array(this.mp4track.len);
        // let offset = 0;
        // let samples=this.mp4track.samples;
        // let mp4Sample, lastDTS, pts, dts;
        //
        // while (this.samples.length) {
        //     let sample = this.samples.shift();
        //     if (sample === null) {
        //         // discontinuity
        //         this.nextDts = undefined;
        //         break;
        //     }
        //
        //     let unit = sample.unit;
        //
        //     pts = Math.round((sample.pts - this.initDTS)/this.tsAlign)*this.tsAlign;
        //     dts = Math.round((sample.dts - this.initDTS)/this.tsAlign)*this.tsAlign;
        //     // ensure DTS is not bigger than PTS
        //     dts = Math.min(pts, dts);
        //
        //     // sampleFunction(pts, dts);   // TODO:
        //
        //     // mp4Sample = setupSample(unit, pts, dts);    // TODO:
        //
        //     payload.set(unit.getData(), offset);
        //     offset += unit.getSize();
        //
        //     samples.push(mp4Sample);
        //     lastDTS = dts;
        // }
        // if (!samples.length) return null;
        //
        // // samplesPostFunction(samples); // TODO:
        //
        // return new Uint8Array(payload.buffer, 0, this.mp4track.len);
    }
}

const Log$8 = getTagged("remuxer:aac");
// TODO: asm.js
class AACRemuxer extends BaseRemuxer {

    constructor(timescale, scaleFactor = 1, params={}) {
        super(timescale, scaleFactor);

        this.codecstring=MSE.CODEC_AAC;
        this.units = [];
        this.initDTS = undefined;
        this.nextAacPts = undefined;
        this.lastPts = 0;
        this.firstDTS = 0;
        this.firstPTS = 0;
        this.duration = params.duration || 1;
        this.initialized = false;

        this.mp4track={
            id:BaseRemuxer.getTrackID(),
            type: 'audio',
            fragmented:true,
            channelCount:0,
            audiosamplerate: this.timescale,
            duration: 0,
            timescale: this.timescale,
            volume: 1,
            samples: [],
            config: '',
            len: 0
        };
        if (params.config) {
            this.setConfig(params.config);
        }
    }

    setConfig(config) {
        this.mp4track.channelCount = config.channels;
        this.mp4track.audiosamplerate = config.samplerate;
        if (!this.mp4track.duration) {
            this.mp4track.duration = (this.duration?this.duration:1)*config.samplerate;
        }
        this.mp4track.timescale = config.samplerate;
        this.mp4track.config = config.config;
        this.mp4track.codec = config.codec;
        this.timescale = config.samplerate;
        this.scaleFactor = BaseRemuxer.MP4_TIMESCALE / config.samplerate;
        this.expectedSampleDuration = 1024 * this.scaleFactor;
        this.readyToDecode = true;
    }

    remux(aac) {
        if (super.remux.call(this, aac)) {
            this.mp4track.len += aac.getSize();
        }
    }

    getPayload() {
        if (!this.readyToDecode || !this.samples.length) return null;
        this.samples.sort(function(a, b) {
            return (a.dts-b.dts);
        });

        let payload = new Uint8Array(this.mp4track.len);
        let offset = 0;
        let samples=this.mp4track.samples;
        let mp4Sample, lastDTS, pts, dts;

        while (this.samples.length) {
            let sample = this.samples.shift();
            if (sample === null) {
                // discontinuity
                this.nextDts = undefined;
                break;
            }
            let unit = sample.unit;
            pts = sample.pts - this.initDTS;
            dts = sample.dts - this.initDTS;

            if (lastDTS === undefined) {
                if (this.nextDts) {
                    let delta = Math.round(this.scaled(pts - this.nextAacPts));
                    // if fragment are contiguous, or delta less than 600ms, ensure there is no overlap/hole between fragments
                    if (/*contiguous || */Math.abs(delta) < 600) {
                        // log delta
                        if (delta) {
                            if (delta > 0) {
                                Log$8.log(`${delta} ms hole between AAC samples detected,filling it`);
                                // if we have frame overlap, overlapping for more than half a frame duraion
                            } else if (delta < -12) {
                                // drop overlapping audio frames... browser will deal with it
                                Log$8.log(`${(-delta)} ms overlapping between AAC samples detected, drop frame`);
                                this.mp4track.len -= unit.getSize();
                                continue;
                            }
                            // set DTS to next DTS
                            pts = dts = this.nextAacPts;
                        }
                    }
                }
                // remember first PTS of our aacSamples, ensure value is positive
                this.firstDTS = Math.max(0, dts);
            }

            mp4Sample = {
                size: unit.getSize(),
                cts: 0,
                duration:1024,
                flags: {
                    isLeading: 0,
                    isDependedOn: 0,
                    hasRedundancy: 0,
                    degradPrio: 0,
                    dependsOn: 1
                }
            };

            payload.set(unit.getData(), offset);
            offset += unit.getSize();
            samples.push(mp4Sample);
            lastDTS = dts;
        }
        if (!samples.length) return null;
        this.nextDts =pts+this.expectedSampleDuration;
        return new Uint8Array(payload.buffer, 0, this.mp4track.len);
    }
}
//test.bundle.js:42 [remuxer:h264] skip frame from the past at DTS=18397972271140676 with expected DTS=18397998040950484

/**
 * Parser for exponential Golomb codes, a variable-bitwidth number encoding scheme used by h264.
*/

class ExpGolomb {

  constructor(data) {
    this.data = data;
    // the number of bytes left to examine in this.data
    this.bytesAvailable = this.data.byteLength;
    // the current word being examined
    this.word = 0; // :uint
    // the number of bits left to examine in the current word
    this.bitsAvailable = 0; // :uint
  }

  // ():void
  loadWord() {
    var
      position = this.data.byteLength - this.bytesAvailable,
      workingBytes = new Uint8Array(4),
      availableBytes = Math.min(4, this.bytesAvailable);
    if (availableBytes === 0) {
      throw new Error('no bytes available');
    }
    workingBytes.set(this.data.subarray(position, position + availableBytes));
    this.word = new DataView(workingBytes.buffer, workingBytes.byteOffset, workingBytes.byteLength).getUint32(0);
    // track the amount of this.data that has been processed
    this.bitsAvailable = availableBytes * 8;
    this.bytesAvailable -= availableBytes;
  }

  // (count:int):void
  skipBits(count) {
    var skipBytes; // :int
    if (this.bitsAvailable > count) {
      this.word <<= count;
      this.bitsAvailable -= count;
    } else {
      count -= this.bitsAvailable;
      skipBytes = count >> 3;
      count -= (skipBytes << 3);
      this.bytesAvailable -= skipBytes;
      this.loadWord();
      this.word <<= count;
      this.bitsAvailable -= count;
    }
  }

  // (size:int):uint
  readBits(size) {
    var
      bits = Math.min(this.bitsAvailable, size), // :uint
      valu = this.word >>> (32 - bits); // :uint
    if (size > 32) {
      Log$b.error('Cannot read more than 32 bits at a time');
    }
    this.bitsAvailable -= bits;
    if (this.bitsAvailable > 0) {
      this.word <<= bits;
    } else if (this.bytesAvailable > 0) {
      this.loadWord();
    }
    bits = size - bits;
    if (bits > 0) {
      return valu << bits | this.readBits(bits);
    } else {
      return valu;
    }
  }

  // ():uint
  skipLZ() {
    var leadingZeroCount; // :uint
    for (leadingZeroCount = 0; leadingZeroCount < this.bitsAvailable; ++leadingZeroCount) {
      if (0 !== (this.word & (0x80000000 >>> leadingZeroCount))) {
        // the first bit of working word is 1
        this.word <<= leadingZeroCount;
        this.bitsAvailable -= leadingZeroCount;
        return leadingZeroCount;
      }
    }
    // we exhausted word and still have not found a 1
    this.loadWord();
    return leadingZeroCount + this.skipLZ();
  }

  // ():void
  skipUEG() {
    this.skipBits(1 + this.skipLZ());
  }

  // ():void
  skipEG() {
    this.skipBits(1 + this.skipLZ());
  }

  // ():uint
  readUEG() {
    var clz = this.skipLZ(); // :uint
    return this.readBits(clz + 1) - 1;
  }

  // ():int
  readEG() {
    var valu = this.readUEG(); // :int
    if (0x01 & valu) {
      // the number is odd if the low order bit is set
      return (1 + valu) >>> 1; // add 1 to make it even, and divide by 2
    } else {
      return -1 * (valu >>> 1); // divide by two then make it negative
    }
  }

  // Some convenience functions
  // :Boolean
  readBoolean() {
    return 1 === this.readBits(1);
  }

  // ():int
  readUByte() {
    return this.readBits(8);
  }

  // ():int
  readUShort() {
    return this.readBits(16);
  }
    // ():int
  readUInt() {
    return this.readBits(32);
  }  
}

// TODO: asm.js

function appendByteArray(buffer1, buffer2) {
    let tmp = new Uint8Array((buffer1.byteLength|0) + (buffer2.byteLength|0));
    tmp.set(buffer1, 0);
    tmp.set(buffer2, buffer1.byteLength|0);
    return tmp;
}
function base64ToArrayBuffer(base64) {
    var binary_string =  window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array( len );
    for (var i = 0; i < len; i++)        {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

function hexToByteArray(hex) {
    let len = hex.length >> 1;
    var bufView = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bufView[i] = parseInt(hex.substr(i<<1,2),16);
    }
    return bufView;
}

function bitSlice(bytearray, start=0, end=bytearray.byteLength*8) {
    let byteLen = Math.ceil((end-start)/8);
    let res = new Uint8Array(byteLen);
    let startByte = start >>> 3;   // /8
    let endByte = (end>>>3) - 1;    // /8
    let bitOffset = start & 0x7;     // %8
    let nBitOffset = 8 - bitOffset;
    let endOffset = 8 - end & 0x7;   // %8
    for (let i=0; i<byteLen; ++i) {
        let tail = 0;
        if (i<endByte) {
            tail = bytearray[startByte+i+1] >> nBitOffset;
            if (i == endByte-1 && endOffset < 8) {
                tail >>= endOffset;
                tail <<= endOffset;
            }
        }
        res[i]=(bytearray[startByte+i]<<bitOffset) | tail;
    }
    return res;
}

class BitArray {

    constructor(src) {
        this.src    = new DataView(src.buffer, src.byteOffset, src.byteLength);
        this.bitpos = 0;
        this.byte   = this.src.getUint8(0); /* This should really be undefined, uint wont allow it though */
        this.bytepos = 0;
    }

    readBits(length) {
        if (32 < (length|0) || 0 === (length|0)) {
            /* To big for an uint */
            throw new Error("too big");
        }

        let result = 0;
        for (let i = length; i > 0; --i) {

            /* Shift result one left to make room for another bit,
             then add the next bit on the stream. */
            result = ((result|0) << 1) | (((this.byte|0) >> (8 - (++this.bitpos))) & 0x01);
            if ((this.bitpos|0)>=8) {
                this.byte = this.src.getUint8(++this.bytepos);
                this.bitpos &= 0x7;
            }
        }

        return result;
    }
    skipBits(length) {
        this.bitpos += (length|0) & 0x7; // %8
        this.bytepos += (length|0) >>> 3;  // *8
        if (this.bitpos > 7) {
            this.bitpos &= 0x7;
            ++this.bytepos;
        }

        if (!this.finished()) {
            this.byte = this.src.getUint8(this.bytepos);
            return 0;
        } else {
            return this.bytepos-this.src.byteLength-this.src.bitpos;
        }
    }
    
    finished() {
        return this.bytepos >= this.src.byteLength;
    }
}

class NALU {

    static get NDR() {return 1;}
    static get SLICE_PART_A() {return 2;}
    static get SLICE_PART_B() {return 3;}
    static get SLICE_PART_C() {return 4;}
    static get IDR() {return 5;}
    static get SEI() {return 6;}
    static get SPS() {return 7;}
    static get PPS() {return 8;}
    static get DELIMITER() {return 9;}
    static get EOSEQ() {return 10;}
    static get EOSTR() {return 11;}
    static get FILTER() {return 12;}
    static get STAP_A() {return 24;}
    static get STAP_B() {return 25;}
    static get FU_A() {return 28;}
    static get FU_B() {return 29;}

    static get TYPES() {return {
        [NALU.IDR]: 'IDR',
        [NALU.SEI]: 'SEI',
        [NALU.SPS]: 'SPS',
        [NALU.PPS]: 'PPS',
        [NALU.NDR]: 'NDR'
    }};

    static type(nalu) {
        if (nalu.ntype in NALU.TYPES) {
            return NALU.TYPES[nalu.ntype];
        } else {
            return 'UNKNOWN';
        }
    }

    constructor(ntype, nri, data, dts, pts) {

        this.data = data;
        this.ntype = ntype;
        this.nri = nri;
        this.dts = dts;
        this.pts = pts ? pts : this.dts;
        this.sliceType = null;
    }

    appendData(idata) {
        this.data = appendByteArray(this.data, idata);
    }

    toString() {
        return `${NALU.type(this)}(${this.data.byteLength}): NRI: ${this.getNri()}, PTS: ${this.pts}, DTS: ${this.dts}`;
    }

    getNri() {
        return this.nri >> 5;
    }

    type() {
        return this.ntype;
    }

    isKeyframe() {
        return this.ntype === NALU.IDR || this.sliceType === 7;
    }

    getSize() {
        return 4 + 1 + this.data.byteLength;
    }

    getData() {
        let header = new Uint8Array(5 + this.data.byteLength);
        let view = new DataView(header.buffer);
        view.setUint32(0, this.data.byteLength + 1);
        view.setUint8(4, (0x0 & 0x80) | (this.nri & 0x60) | (this.ntype & 0x1F));
        header.set(this.data, 5);
        return header;
    }
}

class H264Parser {

    constructor(remuxer) {
        this.remuxer = remuxer;
        this.track = remuxer.mp4track;
        this.firstFound = false;
    }

    msToScaled(timestamp) {
        return (timestamp - this.remuxer.timeOffset) * this.remuxer.scaleFactor;
    }

    parseSPS(sps) {
        var config = H264Parser.readSPS(new Uint8Array(sps));

        this.track.width = config.width;
        this.track.height = config.height;
        this.track.sps = [new Uint8Array(sps)];
        // this.track.timescale = this.remuxer.timescale;
        // this.track.duration = this.remuxer.timescale; // TODO: extract duration for non-live client
        this.track.codec = 'avc1.';

        let codecarray = new DataView(sps.buffer, sps.byteOffset+1, 4);
        for (let i = 0; i < 3; ++i) {
            var h = codecarray.getUint8(i).toString(16);
            if (h.length < 2) {
                h = '0' + h;
            }
            this.track.codec  += h;
        }
    }

    parsePPS(pps) {
        this.track.pps = [new Uint8Array(pps)];
    }

    parseNAL(unit) {
        if (!unit) return false;
        
        let push = null;
        // console.log(unit.toString());
        switch (unit.type()) {
            case NALU.NDR:
            case NALU.IDR:
                unit.sliceType = H264Parser.parceSliceHeader(unit.data);
                if (unit.isKeyframe() && !this.firstFound)  {
                    this.firstFound = true;
                }
                if (this.firstFound) {
                    push = true;
                } else {
                    push = false;
                }
                break;
            case NALU.PPS:
                push = false;
                if (!this.track.pps) {
                    this.parsePPS(unit.getData().subarray(4));
                    if (!this.remuxer.readyToDecode && this.track.pps && this.track.sps) {
                        this.remuxer.readyToDecode = true;
                    }
                }
                break;
            case NALU.SPS:
                push = false;

                if (!this.firstFound)  {
                    if (!navigator.vendor.match(/apple/i)) {
                        if (!navigator.platform.match(/linux/i)) {
                            this.firstFound = true;
                            push = true;
                        }
                    }
                }
                if(!this.track.sps) {
                    this.parseSPS(unit.getData().subarray(4));
                    if (!this.remuxer.readyToDecode && this.track.pps && this.track.sps) {
                        this.remuxer.readyToDecode = true;
                    }
                }
                break;
            case NALU.SEI:
                push = false;
                let data = new DataView(unit.data.buffer, unit.data.byteOffset, unit.data.byteLength);
                let byte_idx = 0;
                let pay_type = data.getUint8(byte_idx);
                ++byte_idx;
                let pay_size = 0;
                let sz = data.getUint8(byte_idx);
                ++byte_idx;
                while (sz === 255) {
                    pay_size+=sz;
                    sz = data.getUint8(byte_idx);
                    ++byte_idx;
                }
                pay_size+=sz;

                let uuid = unit.data.subarray(byte_idx, byte_idx+16);
                byte_idx+=16;
                console.log(`PT: ${pay_type}, PS: ${pay_size}, UUID: ${Array.from(uuid).map(function(i) {
                    return ('0' + i.toString(16)).slice(-2);
                }).join('')}`);
                // debugger;
                break;
            case NALU.EOSEQ:
            case NALU.EOSTR:
                push = false;
        }
        if (push === null && unit.getNri() > 0 ) {
            push=true;
        }
        return push;
    }

    static parceSliceHeader(data) {
        let decoder = new ExpGolomb(data);
        decoder.readUEG();
        let slice_type = decoder.readUEG();
        decoder.readUEG();
        decoder.readUByte();
        // console.log(`first_mb: ${first_mb}, slice_type: ${slice_type}, ppsid: ${ppsid}, frame_num: ${frame_num}`);
        return slice_type;
    }

    /**
     * Advance the ExpGolomb decoder past a scaling list. The scaling
     * list is optionally transmitted as part of a sequence parameter
     * set and is not relevant to transmuxing.
     * @param decoder {ExpGolomb} exp golomb decoder
     * @param count {number} the number of entries in this scaling list
     * @see Recommendation ITU-T H.264, Section 7.3.2.1.1.1
     */
    static skipScalingList(decoder, count) {
        let lastScale = 8,
            nextScale = 8,
            deltaScale;
        for (let j = 0; j < count; j++) {
            if (nextScale !== 0) {
                deltaScale = decoder.readEG();
                nextScale = (lastScale + deltaScale + 256) % 256;
            }
            lastScale = (nextScale === 0) ? lastScale : nextScale;
        }
    }

    /**
     * Read a sequence parameter set and return some interesting video
     * properties. A sequence parameter set is the H264 metadata that
     * describes the properties of upcoming video frames.
     * @param data {Uint8Array} the bytes of a sequence parameter set
     * @return {object} an object with configuration parsed from the
     * sequence parameter set, including the dimensions of the
     * associated video frames.
     */
    static readSPS(data) {
        let decoder = new ExpGolomb(data);
        let frameCropLeftOffset = 0,
            frameCropRightOffset = 0,
            frameCropTopOffset = 0,
            frameCropBottomOffset = 0,
            sarScale = 1,
            profileIdc,numRefFramesInPicOrderCntCycle, picWidthInMbsMinus1,
            picHeightInMapUnitsMinus1,
            frameMbsOnlyFlag,
            scalingListCount;
        decoder.readUByte();
        profileIdc = decoder.readUByte(); // profile_idc
        decoder.readBits(5); // constraint_set[0-4]_flag, u(5)
        decoder.skipBits(3); // reserved_zero_3bits u(3),
        decoder.readUByte(); //level_idc u(8)
        decoder.skipUEG(); // seq_parameter_set_id
        // some profiles have more optional data we don't need
        if (profileIdc === 100 ||
            profileIdc === 110 ||
            profileIdc === 122 ||
            profileIdc === 244 ||
            profileIdc === 44  ||
            profileIdc === 83  ||
            profileIdc === 86  ||
            profileIdc === 118 ||
            profileIdc === 128) {
            var chromaFormatIdc = decoder.readUEG();
            if (chromaFormatIdc === 3) {
                decoder.skipBits(1); // separate_colour_plane_flag
            }
            decoder.skipUEG(); // bit_depth_luma_minus8
            decoder.skipUEG(); // bit_depth_chroma_minus8
            decoder.skipBits(1); // qpprime_y_zero_transform_bypass_flag
            if (decoder.readBoolean()) { // seq_scaling_matrix_present_flag
                scalingListCount = (chromaFormatIdc !== 3) ? 8 : 12;
                for (let i = 0; i < scalingListCount; ++i) {
                    if (decoder.readBoolean()) { // seq_scaling_list_present_flag[ i ]
                        if (i < 6) {
                            H264Parser.skipScalingList(decoder, 16);
                        } else {
                            H264Parser.skipScalingList(decoder, 64);
                        }
                    }
                }
            }
        }
        decoder.skipUEG(); // log2_max_frame_num_minus4
        var picOrderCntType = decoder.readUEG();
        if (picOrderCntType === 0) {
            decoder.readUEG(); //log2_max_pic_order_cnt_lsb_minus4
        } else if (picOrderCntType === 1) {
            decoder.skipBits(1); // delta_pic_order_always_zero_flag
            decoder.skipEG(); // offset_for_non_ref_pic
            decoder.skipEG(); // offset_for_top_to_bottom_field
            numRefFramesInPicOrderCntCycle = decoder.readUEG();
            for(let i = 0; i < numRefFramesInPicOrderCntCycle; ++i) {
                decoder.skipEG(); // offset_for_ref_frame[ i ]
            }
        }
        decoder.skipUEG(); // max_num_ref_frames
        decoder.skipBits(1); // gaps_in_frame_num_value_allowed_flag
        picWidthInMbsMinus1 = decoder.readUEG();
        picHeightInMapUnitsMinus1 = decoder.readUEG();
        frameMbsOnlyFlag = decoder.readBits(1);
        if (frameMbsOnlyFlag === 0) {
            decoder.skipBits(1); // mb_adaptive_frame_field_flag
        }
        decoder.skipBits(1); // direct_8x8_inference_flag
        if (decoder.readBoolean()) { // frame_cropping_flag
            frameCropLeftOffset = decoder.readUEG();
            frameCropRightOffset = decoder.readUEG();
            frameCropTopOffset = decoder.readUEG();
            frameCropBottomOffset = decoder.readUEG();
        }
        if (decoder.readBoolean()) {
            // vui_parameters_present_flag
            if (decoder.readBoolean()) {
                // aspect_ratio_info_present_flag
                let sarRatio;
                const aspectRatioIdc = decoder.readUByte();
                switch (aspectRatioIdc) {
                    case 1: sarRatio = [1,1]; break;
                    case 2: sarRatio = [12,11]; break;
                    case 3: sarRatio = [10,11]; break;
                    case 4: sarRatio = [16,11]; break;
                    case 5: sarRatio = [40,33]; break;
                    case 6: sarRatio = [24,11]; break;
                    case 7: sarRatio = [20,11]; break;
                    case 8: sarRatio = [32,11]; break;
                    case 9: sarRatio = [80,33]; break;
                    case 10: sarRatio = [18,11]; break;
                    case 11: sarRatio = [15,11]; break;
                    case 12: sarRatio = [64,33]; break;
                    case 13: sarRatio = [160,99]; break;
                    case 14: sarRatio = [4,3]; break;
                    case 15: sarRatio = [3,2]; break;
                    case 16: sarRatio = [2,1]; break;
                    case 255: {
                        sarRatio = [decoder.readUByte() << 8 | decoder.readUByte(), decoder.readUByte() << 8 | decoder.readUByte()];
                        break;
                    }
                }
                if (sarRatio) {
                    sarScale = sarRatio[0] / sarRatio[1];
                }
            }
            if (decoder.readBoolean()) {decoder.skipBits(1);}

            if (decoder.readBoolean()) {
                decoder.skipBits(4);
                if (decoder.readBoolean()) {
                    decoder.skipBits(24);
                }
            }
            if (decoder.readBoolean()) {
                decoder.skipUEG();
                decoder.skipUEG();
            }
            if (decoder.readBoolean()) {
                let unitsInTick = decoder.readUInt();
                let timeScale = decoder.readUInt();
                let fixedFrameRate = decoder.readBoolean();
                let frameDuration = timeScale/(2*unitsInTick);
                console.log(`timescale: ${timeScale}; unitsInTick: ${unitsInTick}; fixedFramerate: ${fixedFrameRate}; avgFrameDuration: ${frameDuration}`);
            }
        }
        return {
            width: Math.ceil((((picWidthInMbsMinus1 + 1) * 16) - frameCropLeftOffset * 2 - frameCropRightOffset * 2) * sarScale),
            height: ((2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16) - ((frameMbsOnlyFlag? 2 : 4) * (frameCropTopOffset + frameCropBottomOffset))
        };
    }

    static readSliceType(decoder) {
        // skip NALu type
        decoder.readUByte();
        // discard first_mb_in_slice
        decoder.readUEG();
        // return slice_type
        return decoder.readUEG();
    }
}

const Log$7 = getTagged("remuxer:h264"); 
// TODO: asm.js
class H264Remuxer extends BaseRemuxer {

    constructor(timescale, scaleFactor=1, params={}) {
        super(timescale, scaleFactor);

        this.nextDts = undefined;
        this.readyToDecode = false;
        this.initialized = false;

        this.firstDTS=0;
        this.firstPTS=0;
        this.lastDTS=undefined;
        this.lastSampleDuration = 0;
        this.lastDurations = [];
        // this.timescale = 90000;
        this.tsAlign = Math.round(this.timescale/60);

        this.mp4track={
            id:BaseRemuxer.getTrackID(),
            type: 'video',
            len:0,
            fragmented:true,
            sps:'',
            pps:'',
            width:0,
            height:0,
            timescale: timescale,
            duration: timescale,
            samples: []
        };
        this.samples = [];
        this.lastGopDTS = -99999999999999;
        this.gop=[];
        this.firstUnit = true;

        this.h264 = new H264Parser(this);

        if (params.sps) {
            let arr = new Uint8Array(params.sps);
            if ((arr[0] & 0x1f) === 7) {
                this.setSPS(arr);
            } else {
                Log$7.warn("bad SPS in SDP");
            }
        }
        if (params.pps) {
            let arr = new Uint8Array(params.pps);
            if ((arr[0] & 0x1f) === 8) {
                this.setPPS(arr);
            } else {
                Log$7.warn("bad PPS in SDP");
            }
        }

        if (this.mp4track.pps && this.mp4track.sps) {
            this.readyToDecode = true;
        }
    }

    _scaled(timestamp) {
        return timestamp >>> this.scaleFactor;
    }

    _unscaled(timestamp) {
        return timestamp << this.scaleFactor;
    }

    setSPS(sps) {
        this.h264.parseSPS(sps);
    }

    setPPS(pps) {
        this.h264.parsePPS(pps);
    }

    remux(nalu) {
        if (this.lastGopDTS < nalu.dts) {
            this.gop.sort(BaseRemuxer.dtsSortFunc);
			
			if (this.gop.length > 1) {
                // Aggregate multi-slices which belong to one frame
                const groupedGop = BaseRemuxer.groupByDts(this.gop);
                this.gop = Object.values(groupedGop).map(group => {
                    return group.reduce((preUnit, curUnit) => {
                        const naluData = curUnit.getData();
                        naluData.set(new Uint8Array([0x0, 0x0, 0x0, 0x1]));
                        preUnit.appendData(naluData);
                        return preUnit;
                    });
                });
            }
			
            for (let unit of this.gop) {
                // if (this.firstUnit) {
                //     unit.ntype = 5;//NALU.IDR;
                //     this.firstUnit = false;
                // }
                if (super.remux.call(this, unit)) {
                    this.mp4track.len += unit.getSize();
                }
            }
            this.gop = [];
            this.lastGopDTS = nalu.dts;
        }
        if (this.h264.parseNAL(nalu)) {
            this.gop.push(nalu);
        }
    }

    getPayload() {
        if (!this.getPayloadBase()) {
            return null;
        }

        let payload = new Uint8Array(this.mp4track.len);
        let offset = 0;
        let samples=this.mp4track.samples;
        let mp4Sample, lastDTS, pts, dts;


        // Log.debug(this.samples.map((e)=>{
        //     return Math.round((e.dts - this.initDTS));
        // }));

        // let minDuration = Number.MAX_SAFE_INTEGER;
        while (this.samples.length) {
            let sample = this.samples.shift();
            if (sample === null) {
                // discontinuity
                this.nextDts = undefined;
                break;
            }

            let unit = sample.unit;
            
            pts = sample.pts- this.initDTS; // /*Math.round(*/(sample.pts - this.initDTS)/*/this.tsAlign)*this.tsAlign*/;
            dts = sample.dts - this.initDTS; ///*Math.round(*/(sample.dts - this.initDTS)/*/this.tsAlign)*this.tsAlign*/;
            // ensure DTS is not bigger than PTS
            dts = Math.min(pts,dts);
            // if not first AVC sample of video track, normalize PTS/DTS with previous sample value
            // and ensure that sample duration is positive
            if (lastDTS !== undefined) {
                let sampleDuration = this.scaled(dts - lastDTS);
                // Log.debug(`Sample duration: ${sampleDuration}`);
                if (sampleDuration < 0) {
                    Log$7.log(`invalid AVC sample duration at PTS/DTS: ${pts}/${dts}|lastDTS: ${lastDTS}:${sampleDuration}`);
                    this.mp4track.len -= unit.getSize();
                    continue;
                }
                // minDuration = Math.min(sampleDuration, minDuration);
                this.lastDurations.push(sampleDuration);
                if (this.lastDurations.length > 100) {
                    this.lastDurations.shift();
                }
                mp4Sample.duration = sampleDuration;
            } else {
                if (this.nextDts) {
                    let delta = dts - this.nextDts;
                    // if fragment are contiguous, or delta less than 600ms, ensure there is no overlap/hole between fragments
                    if (/*contiguous ||*/ Math.abs(Math.round(BaseRemuxer.toMS(delta))) < 600) {

                        if (delta) {
                            // set DTS to next DTS
                            // Log.debug(`Video/PTS/DTS adjusted: ${pts}->${Math.max(pts - delta, this.nextDts)}/${dts}->${this.nextDts},delta:${delta}`);
                            dts = this.nextDts;
                            // offset PTS as well, ensure that PTS is smaller or equal than new DTS
                            pts = Math.max(pts - delta, dts);
                        }
                    } else {
                        if (delta < 0) {
                            Log$7.log(`skip frame from the past at DTS=${dts} with expected DTS=${this.nextDts}`);
                            this.mp4track.len -= unit.getSize();
                            continue;
                        }
                    }
                }
                // remember first DTS of our avcSamples, ensure value is positive
                this.firstDTS = Math.max(0, dts);
            }

            mp4Sample = {
                size: unit.getSize(),
                duration: 0,
                cts: this.scaled(pts - dts),
                flags: {
                    isLeading: 0,
                    isDependedOn: 0,
                    hasRedundancy: 0,
                    degradPrio: 0
                }
            };
            let flags = mp4Sample.flags;
            if (sample.unit.isKeyframe() === true) {
                // the current sample is a key frame
                flags.dependsOn = 2;
                flags.isNonSync = 0;
            } else {
                flags.dependsOn = 1;
                flags.isNonSync = 1;
            }

            payload.set(unit.getData(), offset);
            offset += unit.getSize();

            samples.push(mp4Sample);
            lastDTS = dts;
        }

        if (!samples.length) return null;

        let avgDuration = this.lastDurations.reduce(function(a, b) { return (a|0) + (b|0); }, 0) / (this.lastDurations.length||1)|0;
        if (samples.length >= 2) {
            this.lastSampleDuration = avgDuration;
            mp4Sample.duration = avgDuration;
        } else {
            mp4Sample.duration = this.lastSampleDuration;
        }

        if(samples.length && (!this.nextDts || navigator.userAgent.toLowerCase().indexOf('chrome') > -1)) {
            let flags = samples[0].flags;
            // chrome workaround, mark first sample as being a Random Access Point to avoid sourcebuffer append issue
            // https://code.google.com/p/chromium/issues/detail?id=229412
            flags.dependsOn = 2;
            flags.isNonSync = 0;
        }

        // next AVC sample DTS should be equal to last sample DTS + last sample duration
        this.nextDts = dts + this.unscaled(this.lastSampleDuration);
        // Log.debug(`next dts: ${this.nextDts}, last duration: ${this.lastSampleDuration}, last dts: ${dts}`);

        return new Uint8Array(payload.buffer, 0, this.mp4track.len);
    }
}

class PayloadType {
    static get H264() {return 1;}
    static get AAC() {return 2;}

    static get map() {return {
        [PayloadType.H264]: 'video',
        [PayloadType.AAC]: 'audio'
    }};

    static get string_map() {return  {
        H264: PayloadType.H264,
        AAC: PayloadType.AAC,
        'MP4A-LATM': PayloadType.AAC,
        'MPEG4-GENERIC': PayloadType.AAC
    }}
}

const LOG_TAG$4 = "remuxer";
const Log$6 = getTagged(LOG_TAG$4);

class Remuxer {
    static get TrackConverters() {return {
        [PayloadType.H264]: H264Remuxer,
        [PayloadType.AAC]:  AACRemuxer
    }};

    static get TrackScaleFactor() {return {
        [PayloadType.H264]: 1,//4,
        [PayloadType.AAC]:  0
    }};

    static get TrackTimescale() {return {
        [PayloadType.H264]: 90000,//22500,
        [PayloadType.AAC]:  0
    }};

    constructor(mediaElement) {
        this.mse = new MSE([mediaElement]);
        this.eventSource = new EventEmitter();
        this.mseEventSource = new EventSourceWrapper(this.mse.eventSource);
        this.mse_ready = true;

        this.reset();

        this.errorListener = this.mseClose.bind(this);
        this.closeListener = this.mseClose.bind(this);
        this.errorDecodeListener = this.mseErrorDecode.bind(this);

        this.eventSource.addEventListener('ready', this.init.bind(this));
    }

    initMSEHandlers() {
        this.mseEventSource.on('error', this.errorListener);
        this.mseEventSource.on('sourceclosed', this.closeListener);
        this.mseEventSource.on('errordecode', this.errorDecodeListener);
    }

    async reset() {
        this.tracks = {};
        this.initialized = false;
        this.initSegments = {};
        this.codecs = [];
        this.streams = {};
        this.enabled = false;
        await this.mse.clear();
        this.initMSEHandlers();
    }

    destroy() {
        this.mseEventSource.destroy();
        this.mse.destroy();
        this.mse = null;

        this.detachClient();

        this.eventSource.destroy();
    }

    onTracks(tracks) {
        Log$6.debug(`ontracks: `, tracks.detail);
        // store available track types
        for (let track of tracks.detail) {
            this.tracks[track.type] = new Remuxer.TrackConverters[track.type](Remuxer.TrackTimescale[track.type], Remuxer.TrackScaleFactor[track.type], track.params);
            if (track.offset) {
                this.tracks[track.type].timeOffset = track.offset;
            }
            if (track.duration) {
                this.tracks[track.type].mp4track.duration = track.duration*(this.tracks[track.type].timescale || Remuxer.TrackTimescale[track.type]);
                this.tracks[track.type].duration = track.duration;
            } else {
                this.tracks[track.type].duration = 1;
            }

            // this.tracks[track.type].duration
        }
        this.mse.setLive(!this.client.seekable);
    }

    setTimeOffset(timeOffset, track) {
        if (this.tracks[track.type]) {
            this.tracks[track.type].timeOffset = timeOffset;///this.tracks[track.type].scaleFactor;
        }
    }

    get MSE(){
        return this.mse;
    }

    init() {
        let tracks = [];
        this.codecs = [];
        let initmse = [];
        let initPts = Infinity;
        let initDts = Infinity;
        for (let track_type in this.tracks) {
            let track = this.tracks[track_type];
            if (!MSE.isSupported([track.mp4track.codec])) {
                throw new Error(`${track.mp4track.type} codec ${track.mp4track.codec} is not supported`);
            }
            tracks.push(track.mp4track);
            this.codecs.push(track.mp4track.codec);
            track.init(initPts, initDts/*, false*/);
            // initPts = Math.min(track.initPTS, initPts);
            // initDts = Math.min(track.initDTS, initDts);
        }

        for (let track_type in this.tracks) {
            let track = this.tracks[track_type];
            //track.init(initPts, initDts);
            this.initSegments[track_type] = MP4.initSegment([track.mp4track], track.duration*track.timescale, track.timescale);
            initmse.push(this.initMSE(track_type, track.mp4track.codec));
        }

        this.eventSource.dispatchEvent('mp4initsegement', this.tracks);
        this.initialized = true;
        return Promise.all(initmse).then(()=>{
            //this.mse.play();
            this.enabled = true;
        });
        
    }

    initMSE(track_type, codec) {
        if (MSE.isSupported(this.codecs)) {
            return this.mse.setCodec(track_type, `${PayloadType.map[track_type]}/mp4; codecs="${codec}"`).then(()=>{
                this.mse.feed(track_type, this.initSegments[track_type]);
                // this.mse.play();
                // this.enabled = true;
            });
        } else {
            throw new Error('Codecs are not supported');
        }
    }

    mseClose() {
        // this.mse.clear();
        this.client.stop();
        this.eventSource.dispatchEvent('stopped');
    }

    mseErrorDecode() {
        if(this.tracks[2]) {
            console.warn(this.tracks[2].mp4track.type);
            this.mse.buffers[2].destroy();
            delete this.tracks[2];
        }
    }

    flush() {
        this.onSamples();

        if (!this.initialized) {
            // Log.debug(`Initialize...`);
            if (Object.keys(this.tracks).length) {
                for (let track_type in this.tracks) {
                    if (!this.tracks[track_type].readyToDecode || !this.tracks[track_type].samples.length) return;
                    Log$6.debug(`Init MSE for track ${this.tracks[track_type].mp4track.type}`);
                }
                this.eventSource.dispatchEvent('ready');
            }
        } else {
            for (let track_type in this.tracks) {
                let track = this.tracks[track_type];
                let pay = track.getPayload();
                if (pay && pay.byteLength) {
                    let payload = [MP4.moof(track.seq, track.scaled(track.firstDTS), track.mp4track), MP4.mdat(pay)];
                    this.mse.feed(track_type, payload);
                    this.eventSource.dispatchEvent('mp4payload', payload);
                    track.flush();
                }
            }
        }
    }

    onSamples(ev) {
        // TODO: check format
        // let data = ev.detail;
        // if (this.tracks[data.pay] && this.client.sampleQueues[data.pay].length) {
            // console.log(`video ${data.units[0].dts}`);
        for (let qidx in this.client.sampleQueues) {
            let queue = this.client.sampleQueues[qidx];
            while (queue.length) {
                let units = queue.shift();
                if(units){
                    for (let chunk of units) {
                        if(this.tracks[qidx]) {
                            this.tracks[qidx].remux(chunk);
                        }
                    }
                }
            }
        }
        // }
    }

    onAudioConfig(ev) {
        if (this.tracks[ev.detail.pay]) {
            this.tracks[ev.detail.pay].setConfig(ev.detail.config);
        }
    }

    attachClient(client) {
        this.detachClient();
        this.client = client;
        this.clientEventSource = new EventSourceWrapper(this.client.eventSource);
        this.clientEventSource.on('samples', this.samplesListener);
        this.clientEventSource.on('audio_config', this.audioConfigListener);
        this.clientEventSource.on('tracks', this.onTracks.bind(this));
        this.clientEventSource.on('flush', this.flush.bind(this));
        this.clientEventSource.on('clear', ()=>{
            this.reset();
            this.mse.clear().then(()=>{
                //this.mse.play();
                this.initMSEHandlers();
            });
        });
    }

    detachClient() {
        if (this.client) {
            this.clientEventSource.destroy();
            // this.client.eventSource.removeEventListener('samples', this.onSamples.bind(this));
            // this.client.eventSource.removeEventListener('audio_config', this.onAudioConfig.bind(this));
            // // TODO: clear other listeners
            // this.client.eventSource.removeEventListener('clear', this._clearListener);
            // this.client.eventSource.removeEventListener('tracks', this._tracksListener);
            // this.client.eventSource.removeEventListener('flush', this._flushListener);
            this.client = null;
        }
    }
}

class State {
    constructor(name, stateMachine) {
        this.stateMachine = stateMachine;
        this.transitions = new Set();
        this.name = name;
    }


    activate() {
        return Promise.resolve(null);
    }

    finishTransition() {}

    failHandler() {}

    deactivate() {
        return Promise.resolve(null);
    }
}

class StateMachine {
    constructor() {
        this.storage = {};
        this.currentState = null;
        this.states = new Map();
    }

    addState(name, {activate, finishTransition, deactivate}) {
        let state = new State(name, this);
        if (activate) state.activate = activate;
        if (finishTransition) state.finishTransition = finishTransition;
        if (deactivate) state.deactivate = deactivate;
        this.states.set(name, state);
        return this;
    }

    addTransition(fromName, toName){
        if (!this.states.has(fromName)) {
            throw ReferenceError(`No such state: ${fromName} while connecting to ${toName}`);
        }
        if (!this.states.has(toName)) {
            throw ReferenceError(`No such state: ${toName} while connecting from ${fromName}`);
        }
        this.states.get(fromName).transitions.add(toName);
        return this;
    }

    _promisify(res) {
        let promise;
        try {
            promise = res;
            if (!promise.then) {
                promise = Promise.resolve(promise);
            }
        } catch (e) {
            promise = Promise.reject(e);
        }
        return promise;
    }

    transitionTo(stateName) {
        if (this.currentState == null) {
            let state = this.states.get(stateName);
            return this._promisify(state.activate.call(this))
                .then((data)=> {
                    this.currentState = state;
                    return data;
                }).then(state.finishTransition.bind(this)).catch((e)=>{
                    state.failHandler();
                    throw e;
                });
        }
        if (this.currentState.name == stateName) return Promise.resolve();
        if (this.currentState.transitions.has(stateName)) {
            let state = this.states.get(stateName);
            return this._promisify(state.deactivate.call(this))
                .then(state.activate.bind(this)).then((data)=> {
                    this.currentState = state;
                    return data;
                }).then(state.finishTransition.bind(this)).catch((e)=>{
                    state.failHandler();
                    throw e;
                });
        } else {
            return Promise.reject(`No such transition: ${this.currentState.name} to ${stateName}`);
        }
    }

}

const Log$5 = getTagged("parser:sdp");

class SDPParser {
    constructor() {
        this.version = -1;
        this.origin = null;
        this.sessionName = null;
        this.timing = null;
        this.sessionBlock = {};
        this.media = {};
        this.tracks = {};
        this.mediaMap = {};
    }

    parse(content) {
        // Log.debug(content);
        return new Promise((resolve, reject) => {
            var dataString = content;
            var success = true;
            var currentMediaBlock = this.sessionBlock;

            // TODO: multiple audio/video tracks

            for (let line of dataString.split("\n")) {
                line = line.replace(/\r/, '');
                if (0 === line.length) {
                    /* Empty row (last row perhaps?), skip to next */
                    continue;
                }

                switch (line.charAt(0)) {
                    case 'v':
                        if (-1 !== this.version) {
                            Log$5.log('Version present multiple times in SDP');
                            reject();
                            return false;
                        }
                        success = success && this._parseVersion(line);
                        break;

                    case 'o':
                        if (null !== this.origin) {
                            Log$5.log('Origin present multiple times in SDP');
                            reject();
                            return false;
                        }
                        this._parseOrigin(line);
                        success = true; // parsing is optional
                        break;

                    case 's':
                        if (null !== this.sessionName) {
                            Log$5.log('Session Name present multiple times in SDP');
                            reject();
                            return false;
                        }
                        success = success && this._parseSessionName(line);
                        break;

                    case 't':
                        if (null !== this.timing) {
                            Log$5.log('Timing present multiple times in SDP');
                            reject();
                            return false;
                        }
                        success = success && this._parseTiming(line);
                        break;

                    case 'm':
                        if (null !== currentMediaBlock && this.sessionBlock !== currentMediaBlock) {
                            /* Complete previous block and store it */
                            this.media[currentMediaBlock.type] = currentMediaBlock;
                        }

                        /* A wild media block appears */
                        currentMediaBlock = {};
                        currentMediaBlock.rtpmap = {};
                        this._parseMediaDescription(line, currentMediaBlock);
                        break;

                    case 'a':
                        SDPParser._parseAttribute(line, currentMediaBlock);
                        break;

                    default:
                        Log$5.log('Ignored unknown SDP directive: ' + line);
                        break;
                }

                if (!success) {
                    reject();
                    return;
                }
            }

            this.media[currentMediaBlock.type] = currentMediaBlock;

            success ? resolve() : reject();
        });
    }

    _parseVersion(line) {
        let matches = line.match(/^v=([0-9]+)$/);
        if (!matches || !matches.length) {
            Log$5.log('\'v=\' (Version) formatted incorrectly: ' + line);
            return false;
        }

        this.version = matches[1];
        if (0 != this.version) {
            Log$5.log('Unsupported SDP version:' + this.version);
            return false;
        }

        return true;
    }

    _parseOrigin(line) {
        let matches = line.match(/^o=([^ ]+) (-?[0-9]+) (-?[0-9]+) (IN) (IP4|IP6) ([^ ]+)$/);
        if (!matches || !matches.length) {
            Log$5.log('\'o=\' (Origin) formatted incorrectly: ' + line);
            return false;
        }

        this.origin = {};
        this.origin.username = matches[1];
        this.origin.sessionid = matches[2];
        this.origin.sessionversion = matches[3];
        this.origin.nettype = matches[4];
        this.origin.addresstype = matches[5];
        this.origin.unicastaddress = matches[6];

        return true;
    }

    _parseSessionName(line) {
        let matches = line.match(/^s=([^\r\n]+)$/);
        if (!matches || !matches.length) {
            Log$5.log('\'s=\' (Session Name) formatted incorrectly: ' + line);
            return false;
        }

        this.sessionName = matches[1];

        return true;
    }

    _parseTiming(line) {
        let matches = line.match(/^t=([0-9]+) ([0-9]+)$/);
        if (!matches || !matches.length) {
            Log$5.log('\'t=\' (Timing) formatted incorrectly: ' + line);
            return false;
        }

        this.timing = {};
        this.timing.start = matches[1];
        this.timing.stop = matches[2];

        return true;
    }

    _parseMediaDescription(line, media) {
        let matches = line.match(/^m=([^ ]+) ([^ ]+) ([^ ]+)[ ]/);
        if (!matches || !matches.length) {
            Log$5.log('\'m=\' (Media) formatted incorrectly: ' + line);
            return false;
        }

        media.type = matches[1];
        media.port = matches[2];
        media.proto = matches[3];
        media.fmt = line.substr(matches[0].length).split(' ').map(function (fmt, index, array) {
            return parseInt(fmt);
        });

        for (let fmt of media.fmt) {
            this.mediaMap[fmt] = media;
        }

        return true;
    }

    static _parseAttribute(line, media) {
        if (null === media) {
            /* Not in a media block, can't be bothered parsing attributes for session */
            return true;
        }

        var matches;
        /* Used for some cases of below switch-case */
        var separator = line.indexOf(':');
        var attribute = line.substr(0, (-1 === separator) ? 0x7FFFFFFF : separator);
        /* 0x7FF.. is default */

        switch (attribute) {
            case 'a=recvonly':
            case 'a=sendrecv':
            case 'a=sendonly':
            case 'a=inactive':
                media.mode = line.substr('a='.length);
                break;
            case 'a=range':
                matches = line.match(/^a=range:\s*([a-zA-Z-]+)=([0-9TZtz.]+|now)\s*-\s*([0-9TZtz.]*)$/);
                media.range = [Number(matches[2] == "now" ? -1 : matches[2]), Number(matches[3]), matches[1]];
                break;
            case 'a=control':
                media.control = line.substr('a=control:'.length);
                break;

            case 'a=rtpmap':
                matches = line.match(/^a=rtpmap:(\d+) (.*)$/);
                if (null === matches) {
                    Log$5.log('Could not parse \'rtpmap\' of \'a=\'');
                    return false;
                }

                var payload = parseInt(matches[1]);
                media.rtpmap[payload] = {};

                var attrs = matches[2].split('/');
                media.rtpmap[payload].name = attrs[0].toUpperCase();
                media.rtpmap[payload].clock = attrs[1];
                if (undefined !== attrs[2]) {
                    media.rtpmap[payload].encparams = attrs[2];
                }
                media.ptype = PayloadType.string_map[attrs[0].toUpperCase()];

                break;

            case 'a=fmtp':
                matches = line.match(/^a=fmtp:(\d+) (.*)$/);
                if (!matches || 0 === matches.length) {
                    Log$5.log('Could not parse \'fmtp\'  of \'a=\'');
                    return false;
                }

                media.fmtp = {};
                for (var param of matches[2].split(';')) {
                    var idx = param.indexOf('=');
                    media.fmtp[param.substr(0, idx).toLowerCase().trim()] = param.substr(idx + 1).trim();
                }
                break;
        }

        return true;
    }

    getSessionBlock() {
        return this.sessionBlock;
    }

    hasMedia(mediaType) {
        return this.media[mediaType] != undefined;
    }

    getMediaBlock(mediaType) {
        return this.media[mediaType];
    }

    getMediaBlockByPayloadType(pt) {
        // for (var m in this.media) {
        //     if (-1 !== this.media[m].fmt.indexOf(pt)) {
        //         return this.media[m];
        //     }
        // }
        return this.mediaMap[pt] || null;

        //ErrorManager.dispatchError(826, [pt], true);
        // Log.error(`failed to find media with payload type ${pt}`);
        //
        // return null;
    }

    getMediaBlockList() {
        var res = [];
        for (var m in this.media) {
            res.push(m);
        }

        return res;
    }
}

const LOG_TAG$3 = "rtsp:stream";
const Log$4 = getTagged(LOG_TAG$3);

class RTSPStream {

    constructor(client, track) {
        this.state = null;
        this.client = client;
        this.track = track;
        this.rtpChannel = 1;

        this.stopKeepAlive();
        this.keepaliveInterval = null;
        this.keepaliveTime = 30000;
    }

    reset() {
        this.stopKeepAlive();
        this.client.forgetRTPChannel(this.rtpChannel);
        this.client = null;
        this.track = null;
    }

    start(lastSetupPromise = null) {
        if (lastSetupPromise != null) {
            // if a setup was already made, use the same session
            return lastSetupPromise.then((obj) => this.sendSetup(obj.session))
        } else {
            return this.sendSetup();
        }
    }

    stop() {
        return this.sendTeardown();
    }

    getSetupURL(track) {
        let sessionBlock = this.client.sdp.getSessionBlock();
        if (Url.isAbsolute(track.control)) {
            return track.control;
        } else if (Url.isAbsolute(`${sessionBlock.control}${track.control}`)) {
            return `${sessionBlock.control}${track.control}`;
        } else if (Url.isAbsolute(`${this.client.contentBase}${track.control}`)) {
            /* Check the end of the address for a separator */
            if (this.client.contentBase[this.client.contentBase.length - 1] !== '/') {
                return `${this.client.contentBase}/${track.control}`;
            } 

            /* Should probably check session level control before this */
            return `${this.client.contentBase}${track.control}`;
        }
        else {//need return default
            return track.control;
        }
    }

    getControlURL() {
        let ctrl = this.client.sdp.getSessionBlock().control;
        if (Url.isAbsolute(ctrl)) {
            return ctrl;
        } else if (!ctrl || '*' === ctrl) {
            return this.client.contentBase;
        } else {
            return `${this.client.contentBase}${ctrl}`;
        }
    }

    sendKeepalive() {
        if (this.client.methods.includes('GET_PARAMETER')) {
            return this.client.sendRequest('GET_PARAMETER', this.getSetupURL(this.track), {
                'Session': this.session
            });
        } else {
            return this.client.sendRequest('OPTIONS', '*');
        }
    }

    stopKeepAlive() {
        clearInterval(this.keepaliveInterval);
    }

    startKeepAlive() {
        this.keepaliveInterval = setInterval(() => {
            this.sendKeepalive().catch((e) => {
                Log$4.error(e);
                if (e instanceof RTSPError) {
                    if (Number(e.data.parsed.code) == 501) {
                        return;
                    }
                }
                this.client.reconnect();
            });
        }, this.keepaliveTime);
    }

    sendRequest(_cmd, _params = {}) {
        let params = {};
        if (this.session) {
            params['Session'] = this.session;
        }
        Object.assign(params, _params);
        return this.client.sendRequest(_cmd, this.getControlURL(), params);
    }

    sendSetup(session = null) {
        this.state = RTSPClientSM.STATE_SETUP;
        this.rtpChannel = this.client.interleaveChannelIndex;
        let interleavedChannels = this.client.interleaveChannelIndex++ + "-" + this.client.interleaveChannelIndex++;
        let params = {
            'Transport': `RTP/AVP/TCP;unicast;interleaved=${interleavedChannels}`,
            'Date': new Date().toUTCString()
        };
        if(session){
            params.Session = session;
        }
        return this.client.sendRequest('SETUP', this.getSetupURL(this.track), params).then((_data) => {
            this.session = _data.headers['session'].split(';');
            let transport = _data.headers['transport'];
            if (transport) {
                let interleaved = transport.match(/interleaved=([0-9]+)-([0-9]+)/)[1];
                if (interleaved) {
                    this.rtpChannel = Number(interleaved);
                }
            }

            let sessionParamsChunks = this.session.slice(1);
            let sessionParams = {};
            for (let chunk of sessionParamsChunks) {
                let kv = chunk.split('=');
                sessionParams[kv[0]] = kv[1];
            }
            if (sessionParams['timeout']) {
                this.keepaliveInterval = Number(sessionParams['timeout']) * 500; // * 1000 / 2
            }
            /*if (!/RTP\/AVP\/TCP;unicast;interleaved=/.test(_data.headers["transport"])) {
                // TODO: disconnect stream and notify client
                throw new Error("Connection broken");
            }*/
            this.client.useRTPChannel(this.rtpChannel);
            this.startKeepAlive();
            return {track: this.track, data: _data, session: this.session[0]};
        });
    }
}

/*
 * JavaScript MD5
 * https://github.com/blueimp/JavaScript-MD5
 *
 * Copyright 2011, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * https://opensource.org/licenses/MIT
 *
 * Based on
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.2 Copyright (C) Paul Johnston 1999 - 2009
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */


/*
* Add integers, wrapping at 2^32. This uses 16-bit operations internally
* to work around bugs in some JS interpreters.
*/
function safeAdd(x, y) {
    var lsw = (x & 0xFFFF) + (y & 0xFFFF);
    var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF)
}

/*
* Bitwise rotate a 32-bit number to the left.
*/
function bitRotateLeft(num, cnt) {
    return (num << cnt) | (num >>> (32 - cnt))
}

/*
* These functions implement the four basic operations the algorithm uses.
*/
function md5cmn(q, a, b, x, s, t) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
}
function md5ff(a, b, c, d, x, s, t) {
    return md5cmn((b & c) | ((~b) & d), a, b, x, s, t)
}
function md5gg(a, b, c, d, x, s, t) {
    return md5cmn((b & d) | (c & (~d)), a, b, x, s, t)
}
function md5hh(a, b, c, d, x, s, t) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t)
}
function md5ii(a, b, c, d, x, s, t) {
    return md5cmn(c ^ (b | (~d)), a, b, x, s, t)
}

/*
* Calculate the MD5 of an array of little-endian words, and a bit length.
*/
function binlMD5(x, len) {
    /* append padding */
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;

    var i;
    var olda;
    var oldb;
    var oldc;
    var oldd;
    var a = 1732584193;
    var b = -271733879;
    var c = -1732584194;
    var d = 271733878;

    for (i = 0; i < x.length; i += 16) {
        olda = a;
        oldb = b;
        oldc = c;
        oldd = d;

        a = md5ff(a, b, c, d, x[i], 7, -680876936);
        d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
        c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
        b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
        a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
        d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
        c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
        b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
        a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
        d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
        c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
        b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
        a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
        d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
        c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
        b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

        a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
        d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
        c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
        b = md5gg(b, c, d, a, x[i], 20, -373897302);
        a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
        d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
        c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
        b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
        a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
        d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
        c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
        b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
        a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
        d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
        c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
        b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

        a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
        d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
        c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
        b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
        a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
        d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
        c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
        b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
        a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
        d = md5hh(d, a, b, c, x[i], 11, -358537222);
        c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
        b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
        a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
        d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
        c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
        b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

        a = md5ii(a, b, c, d, x[i], 6, -198630844);
        d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
        c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
        b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
        a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
        d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
        c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
        b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
        a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
        d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
        c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
        b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
        a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
        d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
        c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
        b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

        a = safeAdd(a, olda);
        b = safeAdd(b, oldb);
        c = safeAdd(c, oldc);
        d = safeAdd(d, oldd);
    }
    return [a, b, c, d]
}

/*
* Convert an array of little-endian words to a string
*/
function binl2rstr(input) {
    var i;
    var output = '';
    var length32 = input.length * 32;
    for (i = 0; i < length32; i += 8) {
        output += String.fromCharCode((input[i >> 5] >>> (i % 32)) & 0xFF);
    }
    return output
}

/*
* Convert a raw string to an array of little-endian words
* Characters >255 have their high-byte silently ignored.
*/
function rstr2binl(input) {
    var i;
    var output = [];
    output[(input.length >> 2) - 1] = undefined;
    for (i = 0; i < output.length; i += 1) {
        output[i] = 0;
    }
    var length8 = input.length * 8;
    for (i = 0; i < length8; i += 8) {
        output[i >> 5] |= (input.charCodeAt(i / 8) & 0xFF) << (i % 32);
    }
    return output
}

/*
* Calculate the MD5 of a raw string
*/
function rstrMD5(s) {
    return binl2rstr(binlMD5(rstr2binl(s), s.length * 8))
}

/*
* Calculate the HMAC-MD5, of a key and some data (raw strings)
*/
function rstrHMACMD5(key, data) {
    var i;
    var bkey = rstr2binl(key);
    var ipad = [];
    var opad = [];
    var hash;
    ipad[15] = opad[15] = undefined;
    if (bkey.length > 16) {
        bkey = binlMD5(bkey, key.length * 8);
    }
    for (i = 0; i < 16; i += 1) {
        ipad[i] = bkey[i] ^ 0x36363636;
        opad[i] = bkey[i] ^ 0x5C5C5C5C;
    }
    hash = binlMD5(ipad.concat(rstr2binl(data)), 512 + data.length * 8);
    return binl2rstr(binlMD5(opad.concat(hash), 512 + 128))
}

/*
* Convert a raw string to a hex string
*/
function rstr2hex(input) {
    var hexTab = '0123456789abcdef';
    var output = '';
    var x;
    var i;
    for (i = 0; i < input.length; i += 1) {
        x = input.charCodeAt(i);
        output += hexTab.charAt((x >>> 4) & 0x0F) +
            hexTab.charAt(x & 0x0F);
    }
    return output
}

/*
* Encode a string as utf-8
*/
function str2rstrUTF8(input) {
    return unescape(encodeURIComponent(input))
}

/*
* Take string arguments and return either raw or hex encoded strings
*/
function rawMD5(s) {
    return rstrMD5(str2rstrUTF8(s))
}
function hexMD5(s) {
    return rstr2hex(rawMD5(s))
}
function rawHMACMD5(k, d) {
    return rstrHMACMD5(str2rstrUTF8(k), str2rstrUTF8(d))
}
function hexHMACMD5(k, d) {
    return rstr2hex(rawHMACMD5(k, d))
}

function md5(string, key, raw) {
    if (!key) {
        if (!raw) {
            return hexMD5(string)
        }
        return rawMD5(string)
    }
    if (!raw) {
        return hexHMACMD5(key, string)
    }
    return rawHMACMD5(key, string)
}

// TODO: asm.js
class RTP {
    constructor(pkt/*uint8array*/, sdp) {
        let bytes = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);

        this.version   = bytes.getUint8(0) >>> 6;
        this.padding   = bytes.getUint8(0) & 0x20 >>> 5;
        this.has_extension = bytes.getUint8(0) & 0x10 >>> 4;
        this.csrc      = bytes.getUint8(0) & 0x0F;
        this.marker    = bytes.getUint8(1) >>> 7;
        this.pt        = bytes.getUint8(1) & 0x7F;
        this.sequence  = bytes.getUint16(2) ;
        this.timestamp = bytes.getUint32(4);
        this.ssrc      = bytes.getUint32(8);
        this.csrcs     = [];

        let pktIndex=12;
        if (this.csrc>0) {
            this.csrcs.push(bytes.getUint32(pktIndex));
            pktIndex+=4;
        }
        if (this.has_extension==1) {
            this.extension = bytes.getUint16(pktIndex);
            this.ehl = bytes.getUint16(pktIndex+2);
            pktIndex+=4;
            this.header_data = pkt.slice(pktIndex, this.ehl);
            pktIndex += this.ehl;
        }

        this.headerLength = pktIndex;
        if (this.padding) {
            bytes.getUint8(pkt.byteLength-1);
        }

        // this.bodyLength   = pkt.byteLength-this.headerLength-padLength;

        this.media = sdp.getMediaBlockByPayloadType(this.pt);
        if (null === this.media) {
            Log$b.log(`Media description for payload type: ${this.pt} not provided.`);
        } else {
            this.type = this.media.ptype;//PayloadType.string_map[this.media.rtpmap[this.media.fmt[0]].name];
        }

        this.data = pkt.subarray(pktIndex);
        // this.timestamp = 1000 * (this.timestamp / this.media.rtpmap[this.pt].clock);
        // console.log(this);
    }
    getPayload() {
        return this.data;
    }

    getTimestampMS() {
        return this.timestamp; //1000 * (this.timestamp / this.media.rtpmap[this.pt].clock);
    }

    toString() {
        return "RTP(" +
            "version:"   + this.version   + ", " +
            "padding:"   + this.padding   + ", " +
            "has_extension:" + this.has_extension + ", " +
            "csrc:"      + this.csrc      + ", " +
            "marker:"    + this.marker    + ", " +
            "pt:"        + this.pt        + ", " +
            "sequence:"  + this.sequence  + ", " +
            "timestamp:" + this.timestamp + ", " +
            "ssrc:"      + this.ssrc      + ")";
    }

    isVideo(){return this.media.type == 'video';}
    isAudio(){return this.media.type == 'audio';}

    
}

class RTPFactory {
    constructor(sdp) {
        this.tsOffsets={};
        for (let pay in sdp.media) {
            for (let pt of sdp.media[pay].fmt) {
                this.tsOffsets[pt] = {last: 0, overflow: 0};
            }
        }
    }

    build(pkt/*uint8array*/, sdp) {
        let rtp = new RTP(pkt, sdp);

        let tsOffset = this.tsOffsets[rtp.pt];
        if (tsOffset) {
            rtp.timestamp += tsOffset.overflow;
            if (tsOffset.last && Math.abs(rtp.timestamp - tsOffset.last) > 0x7fffffff) {
                console.log(`\nlast ts: ${tsOffset.last}\n
                            new ts: ${rtp.timestamp}\n
                            new ts adjusted: ${rtp.timestamp+0xffffffff}\n
                            last overflow: ${tsOffset.overflow}\n
                            new overflow: ${tsOffset.overflow+0xffffffff}\n
                            `);
                tsOffset.overflow += 0xffffffff;
                rtp.timestamp += 0xffffffff;
            }
            /*if (rtp.timestamp>0xffffffff) {
                console.log(`ts: ${rtp.timestamp}, seq: ${rtp.sequence}`);
            }*/
            tsOffset.last = rtp.timestamp;
        }

        return rtp;
    }
}

class RTSPMessage {
    static get RTSP_1_0() {return  "RTSP/1.0";}

    constructor(_rtsp_version) {
        this.version = _rtsp_version;
    }

    build(_cmd, _host, _params={}, _payload=null) {
        let requestString = `${_cmd} ${_host} ${this.version}\r\n`;
        for (let param in _params) {
            requestString+=`${param}: ${_params[param]}\r\n`;
        }
        // TODO: binary payload
        if (_payload) {
            requestString+=`Content-Length: ${_payload.length}\r\n`;
        }
        requestString+='\r\n';
        if (_payload) {
            requestString+=_payload;
        }
        return requestString;
    }

    parse(_data) {
        let lines = _data.split('\r\n');
        let parsed = {
            headers:{},
            body:null,
            code: 0,
            statusLine: ''
        };

        let match;
        [match, parsed.code, parsed.statusLine] = lines[0].match(new RegExp(`${this.version}[ ]+([0-9]{3})[ ]+(.*)`));
        parsed.code = Number(parsed.code);
        let lineIdx = 1;

        while (lines[lineIdx]) {
            let [k,v] = lines[lineIdx].split(/:(.+)/);
            parsed.headers[k.toLowerCase()] = v.trim();
            lineIdx++;
        }

        parsed.body = lines.slice(lineIdx).join('\n\r');

        return parsed;
    }

}

const MessageBuilder = new RTSPMessage(RTSPMessage.RTSP_1_0);

// TODO: asm.js
class NALUAsm {

    constructor() {
        this.fragmented_nalu = null;
    }


    static parseNALHeader(hdr) {
        return {
            nri: hdr & 0x60,
            type: hdr & 0x1F
        }
    }

    parseSingleNALUPacket(rawData, header, dts, pts) {
        return new NALU(header.type,  header.nri, rawData.subarray(0), dts, pts);
    }

    parseAggregationPacket(rawData, header, dts, pts) {
        let data = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
        let nal_start_idx = 0;
        if (NALU.STAP_B === header.type) {
            data.getUint16(nal_start_idx);
            nal_start_idx += 2;
        }
        let ret = [];
        while (nal_start_idx < data.byteLength) {
            let size = data.getUint16(nal_start_idx) - 1;
            nal_start_idx += 2;
            let header = NALUAsm.parseNALHeader(data.getInt8(nal_start_idx));
            nal_start_idx++;
            let nalu = this.parseSingleNALUPacket(rawData.subarray(nal_start_idx, nal_start_idx+size), header, dts, pts);
            if (nalu !== null) {
                ret.push(nalu);
            }
            nal_start_idx+=size;
        }
        return ret;
    }

    parseFragmentationUnit(rawData, header, dts, pts) {
        let data = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);
        let nal_start_idx = 0;
        let fu_header = data.getUint8(nal_start_idx);
        let is_start = (fu_header & 0x80) >>> 7;
        let is_end = (fu_header & 0x40) >>> 6;
        let payload_type = fu_header & 0x1F;
        let ret = null;

        nal_start_idx++;
        if (NALU.FU_B === header.type) {
            data.getUint16(nal_start_idx);
            nal_start_idx += 2;
        }

        if (is_start) {
            this.fragmented_nalu = new NALU(payload_type, header.nri, rawData.subarray(nal_start_idx), dts, pts);
        }
        if (this.fragmented_nalu && this.fragmented_nalu.ntype === payload_type) {
            if (!is_start) {
                this.fragmented_nalu.appendData(rawData.subarray(nal_start_idx));
            }
            if (is_end) {
                ret = this.fragmented_nalu;
                this.fragmented_nalu = null;
                return ret;
            }
        }
        return null;
    }

    onNALUFragment(rawData, dts, pts) {

        let data = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);

        let header = NALUAsm.parseNALHeader(data.getUint8(0));

        let nal_start_idx = 1;

        let unit = null;
        if (header.type > 0 && header.type < 24) {
            unit = this.parseSingleNALUPacket(rawData.subarray(nal_start_idx), header, dts, pts);
        } else if (NALU.FU_A ===  header.type || NALU.FU_B ===  header.type) {
            unit = this.parseFragmentationUnit(rawData.subarray(nal_start_idx), header, dts, pts);
        } else if (NALU.STAP_A === header.type || NALU.STAP_B === header.type) {
            return this.parseAggregationPacket(rawData.subarray(nal_start_idx), header, dts, pts);
        } else {
            /* 30 - 31 is undefined, ignore those (RFC3984). */
            Log$b.log('Undefined NAL unit, type: ' + header.type);
            return null;
        }
        if (unit) {
            return [unit];
        }
        return null;
    }
}

class AACFrame {

    constructor(data, dts, pts) {
        this.dts = dts;
        this.pts = pts ? pts : this.dts;

        this.data=data;//.subarray(offset);
    }

    getData() {
        return this.data;
    }

    getSize() {
        return this.data.byteLength;
    }
}

// import {AACParser} from "../parsers/aac.js";
// TODO: asm.js
class AACAsm {
    constructor() {
        this.config = null;
    }

    onAACFragment(pkt) {
        let rawData = pkt.getPayload();
        if (!pkt.media) {
            return null;
        }
        let data = new DataView(rawData.buffer, rawData.byteOffset, rawData.byteLength);

        let sizeLength = Number(pkt.media.fmtp['sizelength'] || 0);
        let indexLength = Number(pkt.media.fmtp['indexlength'] || 0);
        let indexDeltaLength = Number(pkt.media.fmtp['indexdeltalength'] || 0);
        let CTSDeltaLength = Number(pkt.media.fmtp['ctsdeltalength'] || 0);
        let DTSDeltaLength = Number(pkt.media.fmtp['dtsdeltalength'] || 0);
        let RandomAccessIndication = Number(pkt.media.fmtp['randomaccessindication'] || 0);
        let StreamStateIndication = Number(pkt.media.fmtp['streamstateindication'] || 0);
        let AuxiliaryDataSizeLength = Number(pkt.media.fmtp['auxiliarydatasizelength'] || 0);

        let configHeaderLength =
            sizeLength + Math.max(indexLength, indexDeltaLength) + CTSDeltaLength + DTSDeltaLength +
            RandomAccessIndication + StreamStateIndication + AuxiliaryDataSizeLength;


        let auHeadersLengthPadded = 0;
        let offset = 0;
        let ts = (Math.round(pkt.getTimestampMS()/1024) << 10) * 90000 / this.config.samplerate;
        if (0 !== configHeaderLength) {
            /* The AU header section is not empty, read it from payload */
            let auHeadersLengthInBits = data.getUint16(0); // Always 2 octets, without padding
            auHeadersLengthPadded = 2 + (auHeadersLengthInBits>>>3) + ((auHeadersLengthInBits & 0x7)?1:0); // Add padding

            //this.config = AACParser.parseAudioSpecificConfig(new Uint8Array(rawData, 0 , auHeadersLengthPadded));
            // TODO: parse config
            let frames = [];
            let frameOffset=0;
            let bits = new BitArray(rawData.subarray(2 + offset));
            let cts = 0;
            let dts = 0;
            for (let offset=0; offset<auHeadersLengthInBits;) {
                let size = bits.readBits(sizeLength);
                bits.readBits(offset?indexDeltaLength:indexLength);
                offset+=sizeLength+(offset?indexDeltaLength:indexLength)/*+2*/;
                if (/*ctsPresent &&*/ CTSDeltaLength) {
                    bits.readBits(1);
                    cts = bits.readBits(CTSDeltaLength);
                    offset+=CTSDeltaLength;
                }
                if (/*dtsPresent && */DTSDeltaLength) {
                    bits.readBits(1);
                    dts = bits.readBits(DTSDeltaLength);
                    offset+=CTSDeltaLength;
                }
                if (RandomAccessIndication) {
                    bits.skipBits(1);
                    offset+=1;
                }
                if (StreamStateIndication) {
                    bits.skipBits(StreamStateIndication);
                    offset+=StreamStateIndication;
                }
                frames.push(new AACFrame(rawData.subarray(auHeadersLengthPadded + frameOffset, auHeadersLengthPadded + frameOffset + size), ts+dts, ts+cts));
                frameOffset+=size;
            }
            return frames;
        } else {
            let aacData = rawData.subarray(auHeadersLengthPadded);
            while (true) {
                if (aacData[offset] !=255) break;
                ++offset;
            }
            ++offset;
            return [new AACFrame(rawData.subarray(auHeadersLengthPadded+offset), ts)];
        }
    }
}

class RTPPayloadParser {

    constructor() {
        this.h264parser = new RTPH264Parser();
        this.aacparser = new RTPAACParser();
    }

    parse(rtp) {
        if (rtp.media.type=='video') {
            return this.h264parser.parse(rtp);
        } else if (rtp.media.type == 'audio') {
            return this.aacparser.parse(rtp);
        }
        return null;
    }
}

class RTPH264Parser {
    constructor() {
        this.naluasm = new NALUAsm();
    }

    parse(rtp) {
        return this.naluasm.onNALUFragment(rtp.getPayload(), rtp.getTimestampMS());
    }
}

class RTPAACParser {

    constructor() {
        this.scale = 1;
        this.asm = new AACAsm();
    }

    setConfig(conf) {
        this.asm.config = conf;
    }

    parse(rtp) {
        return this.asm.onAACFragment(rtp);
    }
}

class BaseClient {
    constructor(options={flush: 100}) {
        this.options = options;
        this.eventSource = new EventEmitter();

        Object.defineProperties(this, {
            sourceUrl: {value: null, writable: true},   // TODO: getter with validator
            paused: {value: true, writable: true},
            seekable: {value: false, writable: true},
            connected: {value: false, writable: true}
        });

        this._onData = ()=>{
            if (this.connected) {
                while (this.transport.dataQueue.length) {
                    this.onData(this.transport.dataQueue.pop());
                }
            }
        };
        this._onConnect = this.onConnected.bind(this);
        this._onDisconnect = this.onDisconnected.bind(this);
    }

    static streamType() {
        return null;    
    }
    
    destroy() {
        this.detachTransport();
    }

    attachTransport(transport) {
        if (this.transport) {
            this.detachTransport();
        }
        this.transport = transport;
        this.transport.eventSource.addEventListener('data', this._onData);
        this.transport.eventSource.addEventListener('connected', this._onConnect);
        this.transport.eventSource.addEventListener('disconnected', this._onDisconnect);
    }

    detachTransport() {
        if (this.transport) {
            this.transport.eventSource.removeEventListener('data', this._onData);
            this.transport.eventSource.removeEventListener('connected', this._onConnect);
            this.transport.eventSource.removeEventListener('disconnected', this._onDisconnect);
            this.transport = null;
        }
    }
    reset() {

    }

    start() {
        Log$b.log('Client started');
        this.paused = false;
        // this.startStreamFlush();
    }

    stop() {
        Log$b.log('Client paused');
        this.paused = true;
        // this.stopStreamFlush();
    }

    seek(timeOffset) {

    }

    setSource(source) {
        this.stop();
        this.endpoint = source;
        this.sourceUrl = source.urlpath;
    }

    startStreamFlush() {
        this.flushInterval = setInterval(()=>{
            if (!this.paused) {
                this.eventSource.dispatchEvent('flush');
            }
        }, this.options.flush);
    }

    stopStreamFlush() {
        clearInterval(this.flushInterval);
    }

    onData(data) {

    }

    onConnected() {
        if (!this.seekable) {
            this.transport.dataQueue = [];
            this.eventSource.dispatchEvent('clear');
        }
        this.connected = true;
    }

    onDisconnected() {
        this.connected = false;
    }

    queryCredentials() {
        return Promise.resolve();
    }

    setCredentials(user, password) {
        this.endpoint.user = user;
        this.endpoint.pass = password;
        this.endpoint.auth = `${user}:${password}`;
    }
}

class AACParser {
    static get SampleRates() {return  [
        96000, 88200,
        64000, 48000,
        44100, 32000,
        24000, 22050,
        16000, 12000,
        11025, 8000,
        7350];}

    // static Profile = [
    //     0: Null
    //     1: AAC Main
    //     2: AAC LC (Low Complexity)
    //     3: AAC SSR (Scalable Sample Rate)
    //     4: AAC LTP (Long Term Prediction)
    //     5: SBR (Spectral Band Replication)
    //     6: AAC Scalable
    // ]

    static parseAudioSpecificConfig(bytesOrBits) {
        let config;
        if (bytesOrBits.byteLength) { // is byteArray
            config = new BitArray(bytesOrBits);
        } else {
            config = bytesOrBits;
        }

        let bitpos = config.bitpos+(config.src.byteOffset+config.bytepos)*8;
        let prof = config.readBits(5);
        this.codec = `mp4a.40.${prof}`;
        let sfi = config.readBits(4);
        if (sfi == 0xf) config.skipBits(24);
        let channels = config.readBits(4);

        return {
            config: bitSlice(new Uint8Array(config.src.buffer), bitpos, bitpos+16),
            codec: `mp4a.40.${prof}`,
            samplerate: AACParser.SampleRates[sfi],
            channels: channels
        }
    }

    static parseStreamMuxConfig(bytes) {
        // ISO_IEC_14496-3 Part 3 Audio. StreamMuxConfig
        let config = new BitArray(bytes);

        if (!config.readBits(1)) {
            config.skipBits(14);
            return AACParser.parseAudioSpecificConfig(config);
        }
    }
}

const LOG_TAG$2 = "rtsp:session";
const Log$3 = getTagged(LOG_TAG$2);

class RTSPSession {

    constructor(client, sessionId) {
        this.state = null;
        this.client = client;
        this.sessionId = sessionId;
        this.url = this.getControlURL();
    }

    reset() {
        this.client = null;
    }

    start() {
        return this.sendPlay();
    }

    stop() {
        return this.sendTeardown();
    }

    getControlURL() {
        let ctrl = this.client.sdp.getSessionBlock().control;
        if (Url.isAbsolute(ctrl)) {
            return ctrl;
        } else if (!ctrl || '*' === ctrl) {
            return this.client.contentBase;
        } else {
            return `${this.client.contentBase}${ctrl}`;
        }
    }

    sendRequest(_cmd, _params = {}) {
        let params = {};
        if (this.sessionId) {
            params['Session'] = this.sessionId;
        }
        Object.assign(params, _params);
        return this.client.sendRequest(_cmd, this.getControlURL(), params);
    }

    async sendPlay(pos = 0) {
        this.state = RTSPClientSM.STATE_PLAY;
        let params = {};
        let range = this.client.sdp.sessionBlock.range;
        if (range) {
            // TODO: seekable
            if (range[0] == -1) {
                range[0] = 0;// Do not handle now at the moment
            }
            // params['Range'] = `${range[2]}=${range[0]}-`;
        }
        let data = await this.sendRequest('PLAY', params);
        this.state = RTSPClientSM.STATE_PLAYING;
        return {data: data};
    }

    async sendPause() {
        if (!this.client.supports("PAUSE")) {
            return;
        }
        this.state = RTSPClientSM.STATE_PAUSE;
        await this.sendRequest("PAUSE");
        this.state = RTSPClientSM.STATE_PAUSED;
    }

    async sendTeardown() {
        if (this.state != RTSPClientSM.STATE_TEARDOWN) {
            this.state = RTSPClientSM.STATE_TEARDOWN;
            await this.sendRequest("TEARDOWN");
            Log$3.log('RTSPClient: STATE_TEARDOWN');
            ///this.client.connection.disconnect();
            // TODO: Notify client
        }
    }
}

const LOG_TAG$1 = "client:rtsp";
const Log$2 = getTagged(LOG_TAG$1);

class RTSPClient extends BaseClient {
    constructor(options={flush: 200}) {
        super(options);
        this.clientSM = new RTSPClientSM(this);
        this.clientSM.ontracks = (tracks) => {
            this.eventSource.dispatchEvent('tracks', tracks);
            this.startStreamFlush();
        };
        this.sampleQueues={};
    }
    
    static streamType() {
        return 'rtsp';
    }

    setSource(url) {
        super.setSource(url);
        this.clientSM.setSource(url);
    }
    attachTransport(transport) {
        super.attachTransport(transport);
        this.clientSM.transport = transport;
    }

    detachTransport() {
        super.detachTransport();
        this.clientSM.transport = null;
    }

    reset() {
        super.reset();
        this.sampleQueues={};
    }

    destroy() {
        this.clientSM.destroy();
        return super.destroy();
    }

    start() {
        super.start();
        if (this.transport) {
            return this.transport.ready.then(() => {
                return this.clientSM.start();
            });
        } else {
            return Promise.reject("no transport attached");
        }
    }

    stop() {
        super.stop();
        return this.clientSM.stop();
    }

    onData(data) {
        this.clientSM.onData(data);
    }

    onConnected() {
        this.clientSM.onConnected();
        super.onConnected();
    }

    onDisconnected() {
        super.onDisconnected();
        this.clientSM.onDisconnected();
    }
}

class AuthError extends Error {
    constructor(msg) {
        super(msg);
    }
}

class RTSPError extends Error {
    constructor(data) {
        super(data.msg);
        this.data = data;
    }
}

class RTSPClientSM extends StateMachine {
    static get USER_AGENT() {return 'SFRtsp 0.3';}
    static get STATE_INITIAL() {return  1 << 0;}
    static get STATE_OPTIONS() {return 1 << 1;}
    static get STATE_DESCRIBE () {return  1 << 2;}
    static get STATE_SETUP() {return  1 << 3;}
    static get STATE_STREAMS() {return 1 << 4;}
    static get STATE_TEARDOWN() {return  1 << 5;}
    static get STATE_PLAY() {return  1 << 6;}
    static get STATE_PLAYING() {return  1 << 7;}
    static get STATE_PAUSE() {return  1 << 8;}
    static get STATE_PAUSED() {return  1 << 9;}
    // static STATE_PAUSED = 1 << 6;

    constructor(parent) {
        super();

        this.parent = parent;
        this.transport = null;
        this.payParser = new RTPPayloadParser();
        this.rtp_channels = new Set();
        this.sessions = {};
        this.ontracks = null;

        this.addState(RTSPClientSM.STATE_INITIAL,{
        }).addState(RTSPClientSM.STATE_OPTIONS, {
            activate: this.sendOptions,
            finishTransition: this.onOptions
        }).addState(RTSPClientSM.STATE_DESCRIBE, {
            activate: this.sendDescribe,
            finishTransition: this.onDescribe
        }).addState(RTSPClientSM.STATE_SETUP, {
            activate: this.sendSetup,
            finishTransition: this.onSetup
        }).addState(RTSPClientSM.STATE_STREAMS, {

        }).addState(RTSPClientSM.STATE_TEARDOWN, {
            activate: ()=>{
                this.started = false;
            },
            finishTransition: ()=>{
                return this.transitionTo(RTSPClientSM.STATE_INITIAL)
            }
        }).addTransition(RTSPClientSM.STATE_INITIAL, RTSPClientSM.STATE_OPTIONS)
            .addTransition(RTSPClientSM.STATE_INITIAL, RTSPClientSM.STATE_TEARDOWN)
            .addTransition(RTSPClientSM.STATE_OPTIONS, RTSPClientSM.STATE_DESCRIBE)
            .addTransition(RTSPClientSM.STATE_DESCRIBE, RTSPClientSM.STATE_SETUP)
            .addTransition(RTSPClientSM.STATE_SETUP, RTSPClientSM.STATE_STREAMS)
            .addTransition(RTSPClientSM.STATE_TEARDOWN, RTSPClientSM.STATE_INITIAL)
            // .addTransition(RTSPClientSM.STATE_STREAMS, RTSPClientSM.STATE_PAUSED)
            // .addTransition(RTSPClientSM.STATE_PAUSED, RTSPClientSM.STATE_STREAMS)
            .addTransition(RTSPClientSM.STATE_STREAMS, RTSPClientSM.STATE_TEARDOWN)
            // .addTransition(RTSPClientSM.STATE_PAUSED, RTSPClientSM.STATE_TEARDOWN)
            .addTransition(RTSPClientSM.STATE_SETUP, RTSPClientSM.STATE_TEARDOWN)
            .addTransition(RTSPClientSM.STATE_DESCRIBE, RTSPClientSM.STATE_TEARDOWN)
            .addTransition(RTSPClientSM.STATE_OPTIONS, RTSPClientSM.STATE_TEARDOWN);

        this.reset();

        this.shouldReconnect = false;

        // TODO: remove listeners
        // this.connection.eventSource.addEventListener('connected', ()=>{
        //     if (this.shouldReconnect) {
        //         this.reconnect();
        //     }
        // });
        // this.connection.eventSource.addEventListener('disconnected', ()=>{
        //     if (this.started) {
        //         this.shouldReconnect = true;
        //     }
        // });
        // this.connection.eventSource.addEventListener('data', (data)=>{
        //     let channel = new DataView(data).getUint8(1);
        //     if (this.rtp_channels.has(channel)) {
        //         this.onRTP({packet: new Uint8Array(data, 4), type: channel});
        //     }
        //
        // });
    }

    destroy() {
        this.parent = null;
    }

    setSource(url) {
        this.reset();
        this.endpoint = url;
        this.url = `${url.protocol}://${url.location}${url.urlpath}`;
    }

    onConnected() {
        if (this.rtpFactory) {
            this.rtpFactory = null;
        }
        if (this.shouldReconnect) {
            this.start();
        }
    }

    async onDisconnected() {
        this.reset();
        this.shouldReconnect = true;
        await this.transitionTo(RTSPClientSM.STATE_TEARDOWN);
        await this.transitionTo(RTSPClientSM.STATE_INITIAL);
    }

    start() {
        if (this.currentState.name !== RTSPClientSM.STATE_STREAMS) {
            return this.transitionTo(RTSPClientSM.STATE_OPTIONS);
        } else {
            // TODO: seekable
            let promises = [];
            for (let session in this.sessions) {
                promises.push(this.sessions[session].sendPlay());
            }
            return Promise.all(promises);
        }
    }

    onData(data) {
        let channel = data[1];
        if (this.rtp_channels.has(channel)) {
            this.onRTP({packet: data.subarray(4), type: channel});
        }
    }

    useRTPChannel(channel) {
        this.rtp_channels.add(channel);
    }

    forgetRTPChannel(channel) {
        this.rtp_channels.delete(channel);
    }

    stop() {
        this.shouldReconnect = false;
        let promises = [];
        for (let session in this.sessions) {
            promises.push(this.sessions[session].sendPause());
        }
        return Promise.all(promises);
        // this.mse = null;
    }

    async reset() {
        this.authenticator = '';
        this.methods = [];
        this.tracks = [];
        this.rtpBuffer={};
        for (let stream in this.streams) {
            this.streams[stream].reset();
        }
        for (let session in this.sessions) {
            this.sessions[session].reset();
        }
        this.streams={};
        this.sessions={};
        this.contentBase = "";
        if (this.currentState) {
            if (this.currentState.name != RTSPClientSM.STATE_INITIAL) {
                await this.transitionTo(RTSPClientSM.STATE_TEARDOWN);
                await this.transitionTo(RTSPClientSM.STATE_INITIAL);
            }
        } else {
            await this.transitionTo(RTSPClientSM.STATE_INITIAL);
        }
        this.sdp = null;
        this.interleaveChannelIndex = 0;
        this.session = null;
        this.timeOffset = {};
        this.lastTimestamp = {};
    }

    async reconnect() {
        //this.parent.eventSource.dispatchEvent('clear');
        await this.reset();
        if (this.currentState.name != RTSPClientSM.STATE_INITIAL) {
            await this.transitionTo(RTSPClientSM.STATE_TEARDOWN);
            return this.transitionTo(RTSPClientSM.STATE_OPTIONS);
        } else {
            return this.transitionTo(RTSPClientSM.STATE_OPTIONS);
        }
    }

    supports(method) {
        return this.methods.includes(method)
    }

    parse(_data) {
        Log$2.debug(_data.payload);
        let d=_data.payload.split('\r\n\r\n');
        let parsed =  MessageBuilder.parse(d[0]);
        let len = Number(parsed.headers['content-length']);
        if (len) {
            let d=_data.payload.split('\r\n\r\n');
            parsed.body = d[1];
        } else {
            parsed.body="";
        }
        return parsed
    }

    sendRequest(_cmd, _host, _params={}, _payload=null) {
        this.cSeq++;
        Object.assign(_params, {
            CSeq: this.cSeq,
            'User-Agent': RTSPClientSM.USER_AGENT
        });
        if (this.authenticator) {
            _params['Authorization'] = this.authenticator(_cmd);
        }
        return this.send(MessageBuilder.build(_cmd, _host, _params, _payload), _cmd).catch((e)=>{
            if ((e instanceof AuthError) && !_params['Authorization'] ) {
                return this.sendRequest(_cmd, _host, _params, _payload);
            } else {
                throw e;
            }
        });
    }

    async send(_data, _method) {
        if (this.transport) {
            try {
                await this.transport.ready;
            } catch(e) {
                this.onDisconnected();
                throw e;
            }
            Log$2.debug(_data);
            let response = await this.transport.send(_data);
            let parsed = this.parse(response);
            // TODO: parse status codes
            if (parsed.code == 401 /*&& !this.authenticator */) {
                Log$2.debug(parsed.headers['www-authenticate']);
                let auth = parsed.headers['www-authenticate'];
                let method = auth.substring(0, auth.indexOf(' '));
                auth = auth.substr(method.length+1);
                let chunks = auth.split(',');

                let ep = this.parent.endpoint;
                if (!ep.user || !ep.pass) {
                    try {
                        await this.parent.queryCredentials.call(this.parent);
                    } catch (e) {
                        throw new AuthError();
                    }
                }

                if (method.toLowerCase() == 'digest') {
                    let parsedChunks = {};
                    for (let chunk of chunks) {
                        let c = chunk.trim();
                        let [k,v] = c.split('=');
                        parsedChunks[k] = v.substr(1, v.length-2);
                    }
                    this.authenticator = (_method)=>{
                        let ep = this.parent.endpoint;
                        let ha1 = md5(`${ep.user}:${parsedChunks.realm}:${ep.pass}`);
                        let ha2 = md5(`${_method}:${this.url}`);
                        let response = md5(`${ha1}:${parsedChunks.nonce}:${ha2}`);
                        let tail=''; // TODO: handle other params
                        return `Digest username="${ep.user}", realm="${parsedChunks.realm}", nonce="${parsedChunks.nonce}", uri="${this.url}", response="${response}"${tail}`;
                    };
                } else {
                    this.authenticator = ()=>{return `Basic ${btoa(this.parent.endpoint.auth)}`;};
                }

                throw new AuthError(parsed);
            }
            if (parsed.code >= 300) {
                Log$2.error(parsed.statusLine);
                this.parent.options.errorHandler(new RTSPError({msg: `RTSP error: ${parsed.code} ${parsed.statusLine}`, parsed: parsed}));
            }
            return parsed;
        } else {
            return Promise.reject("No transport attached");
        }
    }

    sendOptions() {
        this.reset();
        this.started = true;
        this.cSeq = 0;
        return this.sendRequest('OPTIONS', this.url, {});
    }

    onOptions(data) {
        this.methods = data.headers['public'].split(',').map((e)=>e.trim());
        this.transitionTo(RTSPClientSM.STATE_DESCRIBE);
    }

    sendDescribe() {
        return this.sendRequest('DESCRIBE', this.url, {
            'Accept': 'application/sdp'
        }).then((data)=>{
            this.sdp = new SDPParser();
            return this.sdp.parse(data.body).catch(()=>{
                throw new Error("Failed to parse SDP");
            }).then(()=>{return data;});
        });
    }

    onDescribe(data) {
        this.contentBase = data.headers['content-base'] || this.url;// `${this.endpoint.protocol}://${this.endpoint.location}${this.endpoint.urlpath}/`;
        this.tracks = this.sdp.getMediaBlockList();
        this.rtpFactory = new RTPFactory(this.sdp);

        Log$2.log('SDP contained ' + this.tracks.length + ' track(s). Calling SETUP for each.');

        if (data.headers['session']) {
            this.session = data.headers['session'];
        }

        if (!this.tracks.length) {
            throw new Error("No tracks in SDP");
        }

        this.transitionTo(RTSPClientSM.STATE_SETUP);
    }

    sendSetup() {
        let streams=[];
		let lastPromise = null;

        // TODO: select first video and first audio tracks
        for (let track_type of this.tracks) {
            Log$2.log("setup track: "+track_type);
            // if (track_type=='audio') continue;
            // if (track_type=='video') continue;
            let track = this.sdp.getMediaBlock(track_type);
            // If payload type is defined in the specification then "rtpmap" may be not specified
            if (!track.rtpmap[track.fmt[0]]) {
                Log$2.warn(`Pyload type "${track.fmt[0]}" is not supported`);
                continue;
            }

            // If payload type is dynamic then check it encoding name
            if (!PayloadType.string_map[track.rtpmap[track.fmt[0]].name]) {
                Log$2.warn(`Pyload type "${track.rtpmap[track.fmt[0]].name}" is not supported`);
                continue;
            }

            this.streams[track_type] = new RTSPStream(this, track);
            let setupPromise = this.streams[track_type].start(lastPromise);
            lastPromise = setupPromise;
            this.parent.sampleQueues[PayloadType.string_map[track.rtpmap[track.fmt[0]].name]]=[];
            this.rtpBuffer[track.fmt[0]]=[];
            streams.push(setupPromise.then(({track, data})=>{
                this.timeOffset[track.fmt[0]] = 0;
                try {
                    let rtp_info = data.headers["rtp-info"].split(';');
                    for (let chunk of rtp_info) {
                        let [key, val] = chunk.split("=");
                        if (key === "rtptime") {
                            this.timeOffset[track.fmt[0]] = 0;//Number(val);
                        }
                    }
                } catch (e) {
                    // new Date().getTime();
                }
                let params = {
                    timescale: 0,
                    scaleFactor: 0
                };
                if (track.fmtp) {
                    if (track.fmtp['sprop-parameter-sets']) {
                        let sps_pps = track.fmtp['sprop-parameter-sets'].split(',');
                        params = {
                            sps:base64ToArrayBuffer(sps_pps[0]),
                            pps:base64ToArrayBuffer(sps_pps[1])
                        };
                    } else if (track.fmtp['config']) {
                        let config = track.fmtp['config'];
                        this.has_config = track.fmtp['cpresent']!='0';
                        let generic = track.rtpmap[track.fmt[0]].name == 'MPEG4-GENERIC';
                        if (generic) {
                            params={config:
                                AACParser.parseAudioSpecificConfig(hexToByteArray(config))
                            };
                            this.payParser.aacparser.setConfig(params.config);
                        } else if (config) {
                            // todo: parse audio specific config for mpeg4-generic
                            params={config:
                                AACParser.parseStreamMuxConfig(hexToByteArray(config))
                            };
                            this.payParser.aacparser.setConfig(params.config);
                        }
                    }
                }
                params.duration = this.sdp.sessionBlock.range?this.sdp.sessionBlock.range[1]-this.sdp.sessionBlock.range[0]:1;
                this.parent.seekable = (params.duration > 1);
                let res = {
                    track: track,
                    offset: this.timeOffset[track.fmt[0]],
                    type: PayloadType.string_map[track.rtpmap[track.fmt[0]].name],
                    params: params,
                    duration: params.duration
                };
                console.log(res, this.timeOffset);
                let session = data.headers.session.split(';')[0];
                if (!this.sessions[session]) {
                    this.sessions[session] = new RTSPSession(this, session);
                }
                return res;
            }));
        }
        return Promise.all(streams).then((tracks)=>{
            let sessionPromises = [];
            for (let session in this.sessions) {
                sessionPromises.push(this.sessions[session].start());
            }
            return Promise.all(sessionPromises).then(()=>{
                if (this.ontracks) {
                    this.ontracks(tracks);
                }
            })
        }).catch((e)=>{
            console.error(e);
            this.stop();
            this.reset();
        });
    }

    onSetup() {
        this.transitionTo(RTSPClientSM.STATE_STREAMS);
    }

    onRTP(_data) {
        if (!this.rtpFactory) return;

        let rtp = this.rtpFactory.build(_data.packet, this.sdp);
        if (!rtp.type) {
            return;
        }

        if (this.timeOffset[rtp.pt] === undefined) {
            //console.log(rtp.pt, this.timeOffset[rtp.pt]);
            this.rtpBuffer[rtp.pt].push(rtp);
            return;
        }

        if (this.lastTimestamp[rtp.pt] === undefined) {
            this.lastTimestamp[rtp.pt] = rtp.timestamp-this.timeOffset[rtp.pt];
        }

        let queue = this.rtpBuffer[rtp.pt];
        queue.push(rtp);

        while (queue.length) {
            let rtp = queue.shift();

            rtp.timestamp = rtp.timestamp-this.timeOffset[rtp.pt]-this.lastTimestamp[rtp.pt];
            // TODO: overflow
            // if (rtp.timestamp < 0) {
            //     rtp.timestamp = (rtp.timestamp + Number.MAX_SAFE_INTEGER) % 0x7fffffff;
            // }
            if (rtp.media) {
                let pay = this.payParser.parse(rtp);
                if (pay) {
                    // if (typeof pay == typeof []) {
                    this.parent.sampleQueues[rtp.type].push(pay);
                    // } else {
                    //     this.parent.sampleQueues[rtp.type].push([pay]);
                    // }
                }
            }
        }
        // this.remuxer.feedRTP();
    }
}

// ASN.1 JavaScript decoder
// Copyright (c) 2008-2013 Lapo Luchini <lapo@lapo.it>

// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// 
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

/*jshint browser: true, strict: true, immed: true, latedef: true, undef: true, regexdash: false */
/*global oids */

var hardLimit = 100,
    ellipsis = "\u2026",
    DOM = {
        tag: function (tagName, className) {
            var t = document.createElement(tagName);
            t.className = className;
            return t;
        },
        text: function (str) {
            return document.createTextNode(str);
        }
    };

class Stream {
    static get hexDigits() {
        return "0123456789ABCDEF";
    };

    static get reTime() {
        return /^((?:1[89]|2\d)?\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])(?:([0-5]\d)(?:([0-5]\d)(?:[.,](\d{1,3}))?)?)?(Z|[-+](?:[0]\d|1[0-2])([0-5]\d)?)?$/;
    }


    constructor(enc, pos) {
        if (enc instanceof Stream) {
            this.enc = enc.enc;
            this.pos = enc.pos;
        } else {
            this.enc = enc;
            this.pos = pos;
        }
    }

    get(pos) {
        if (pos === undefined)
            pos = this.pos++;
        if (pos >= this.enc.length)
            throw 'Requesting byte offset ' + pos + ' on a stream of length ' + this.enc.length;
        return this.enc[pos];
    };

    hexByte(b) {
        return Stream.hexDigits.charAt((b >> 4) & 0xF) + Stream.hexDigits.charAt(b & 0xF);
    };

    hexDump(start, end, raw) {
        var s = "";
        for (var i = start; i < end; ++i) {
            s += this.hexByte(this.get(i));
            if (raw !== true)
                switch (i & 0xF) {
                    case 0x7:
                        s += "  ";
                        break;
                    case 0xF:
                        s += "\n";
                        break;
                    default:
                        s += " ";
                }
        }
        return s;
    };

    parseStringISO(start, end) {
        var s = "";
        for (var i = start; i < end; ++i)
            s += String.fromCharCode(this.get(i));
        return s;
    };

    parseStringUTF(start, end) {
        var s = "";
        for (var i = start; i < end;) {
            var c = this.get(i++);
            if (c < 128)
                s += String.fromCharCode(c);
            else if ((c > 191) && (c < 224))
                s += String.fromCharCode(((c & 0x1F) << 6) | (this.get(i++) & 0x3F));
            else
                s += String.fromCharCode(((c & 0x0F) << 12) | ((this.get(i++) & 0x3F) << 6) | (this.get(i++) & 0x3F));
        }
        return s;
    };

    parseStringBMP(start, end) {
        var str = "";
        for (var i = start; i < end; i += 2) {
            var high_byte = this.get(i);
            var low_byte = this.get(i + 1);
            str += String.fromCharCode((high_byte << 8) + low_byte);
        }

        return str;
    };

    parseTime(start, end) {
        var s = this.parseStringISO(start, end),
            m = Stream.reTime.exec(s);
        if (!m)
            return "Unrecognized time: " + s;
        s = m[1] + "-" + m[2] + "-" + m[3] + " " + m[4];
        if (m[5]) {
            s += ":" + m[5];
            if (m[6]) {
                s += ":" + m[6];
                if (m[7])
                    s += "." + m[7];
            }
        }
        if (m[8]) {
            s += " UTC";
            if (m[8] != 'Z') {
                s += m[8];
                if (m[9])
                    s += ":" + m[9];
            }
        }
        return s;
    };

    parseInteger(start, end) {
        //TODO support negative numbers
        var len = end - start;
        if (len > 4) {
            len <<= 3;
            var s = this.get(start);
            if (s === 0)
                len -= 8;
            else
                while (s < 128) {
                    s <<= 1;
                    --len;
                }
            return "(" + len + " bit)";
        }
        var n = 0;
        for (var i = start; i < end; ++i)
            n = (n << 8) | this.get(i);
        return n;
    };

    parseBitString(start, end) {
        var unusedBit = this.get(start),
            lenBit = ((end - start - 1) << 3) - unusedBit,
            s = "(" + lenBit + " bit)";
        if (lenBit <= 20) {
            var skip = unusedBit;
            s += " ";
            for (var i = end - 1; i > start; --i) {
                var b = this.get(i);
                for (var j = skip; j < 8; ++j)
                    s += (b >> j) & 1 ? "1" : "0";
                skip = 0;
            }
        }
        return s;
    };

    parseOctetString(start, end) {
        var len = end - start,
            s = "(" + len + " byte) ";
        if (len > hardLimit)
            end = start + hardLimit;
        for (var i = start; i < end; ++i)
            s += this.hexByte(this.get(i)); //TODO: also try Latin1?
        if (len > hardLimit)
            s += ellipsis;
        return s;
    };

    parseOID(start, end) {
        var s = '',
            n = 0,
            bits = 0;
        for (var i = start; i < end; ++i) {
            var v = this.get(i);
            n = (n << 7) | (v & 0x7F);
            bits += 7;
            if (!(v & 0x80)) { // finished
                if (s === '') {
                    var m = n < 80 ? n < 40 ? 0 : 1 : 2;
                    s = m + "." + (n - m * 40);
                } else
                    s += "." + ((bits >= 31) ? "bigint" : n);
                n = bits = 0;
            }
        }
        return s;
    };
}

class ASN1 {
    static get reSeemsASCII() {
        return /^[ -~]+$/;
    }

    constructor(stream, header, length, tag, sub) {
        this.stream = stream;
        this.header = header;
        this.length = length;
        this.tag = tag;
        this.sub = sub;
    }

    typeName() {
        if (this.tag === undefined)
            return "unknown";
        var tagClass = this.tag >> 6;
            (this.tag >> 5) & 1;
            var tagNumber = this.tag & 0x1F;
        switch (tagClass) {
            case 0: // universal
                switch (tagNumber) {
                    case 0x00:
                        return "EOC";
                    case 0x01:
                        return "BOOLEAN";
                    case 0x02:
                        return "INTEGER";
                    case 0x03:
                        return "BIT_STRING";
                    case 0x04:
                        return "OCTET_STRING";
                    case 0x05:
                        return "NULL";
                    case 0x06:
                        return "OBJECT_IDENTIFIER";
                    case 0x07:
                        return "ObjectDescriptor";
                    case 0x08:
                        return "EXTERNAL";
                    case 0x09:
                        return "REAL";
                    case 0x0A:
                        return "ENUMERATED";
                    case 0x0B:
                        return "EMBEDDED_PDV";
                    case 0x0C:
                        return "UTF8String";
                    case 0x10:
                        return "SEQUENCE";
                    case 0x11:
                        return "SET";
                    case 0x12:
                        return "NumericString";
                    case 0x13:
                        return "PrintableString"; // ASCII subset
                    case 0x14:
                        return "TeletexString"; // aka T61String
                    case 0x15:
                        return "VideotexString";
                    case 0x16:
                        return "IA5String"; // ASCII
                    case 0x17:
                        return "UTCTime";
                    case 0x18:
                        return "GeneralizedTime";
                    case 0x19:
                        return "GraphicString";
                    case 0x1A:
                        return "VisibleString"; // ASCII subset
                    case 0x1B:
                        return "GeneralString";
                    case 0x1C:
                        return "UniversalString";
                    case 0x1E:
                        return "BMPString";
                    default:
                        return "Universal_" + tagNumber.toString(16);
                }
            case 1:
                return "Application_" + tagNumber.toString(16);
            case 2:
                return "[" + tagNumber + "]"; // Context
            case 3:
                return "Private_" + tagNumber.toString(16);
        }
    }

    content() {
        if (this.tag === undefined)
            return null;
        var tagClass = this.tag >> 6,
            tagNumber = this.tag & 0x1F,
            content = this.posContent(),
            len = Math.abs(this.length);
        if (tagClass !== 0) { // universal
            if (this.sub !== null)
                return "(" + this.sub.length + " elem)";
            //TODO: TRY TO PARSE ASCII STRING
            var s = this.stream.parseStringISO(content, content + Math.min(len, hardLimit));
            if (ASN1.reSeemsASCII.test(s))
                return s.substring(0, 2 * hardLimit) + ((s.length > 2 * hardLimit) ? ellipsis : "");
            else
                return this.stream.parseOctetString(content, content + len);
        }
        switch (tagNumber) {
            case 0x01: // BOOLEAN
                return (this.stream.get(content) === 0) ? "false" : "true";
            case 0x02: // INTEGER
                return this.stream.parseInteger(content, content + len);
            case 0x03: // BIT_STRING
                return this.sub ? "(" + this.sub.length + " elem)" :
                    this.stream.parseBitString(content, content + len);
            case 0x04: // OCTET_STRING
                return this.sub ? "(" + this.sub.length + " elem)" :
                    this.stream.parseOctetString(content, content + len);
            //case 0x05: // NULL
            case 0x06: // OBJECT_IDENTIFIER
                return this.stream.parseOID(content, content + len);
            //case 0x07: // ObjectDescriptor
            //case 0x08: // EXTERNAL
            //case 0x09: // REAL
            //case 0x0A: // ENUMERATED
            //case 0x0B: // EMBEDDED_PDV
            case 0x10: // SEQUENCE
            case 0x11: // SET
                return "(" + this.sub.length + " elem)";
            case 0x0C: // UTF8String
                return this.stream.parseStringUTF(content, content + len);
            case 0x12: // NumericString
            case 0x13: // PrintableString
            case 0x14: // TeletexString
            case 0x15: // VideotexString
            case 0x16: // IA5String
            //case 0x19: // GraphicString
            case 0x1A: // VisibleString
                //case 0x1B: // GeneralString
                //case 0x1C: // UniversalString
                return this.stream.parseStringISO(content, content + len);
            case 0x1E: // BMPString
                return this.stream.parseStringBMP(content, content + len);
            case 0x17: // UTCTime
            case 0x18: // GeneralizedTime
                return this.stream.parseTime(content, content + len);
        }
        return null;
    };

    toString() {
        return this.typeName() + "@" + this.stream.pos + "[header:" + this.header + ",length:" + this.length + ",sub:" + ((this.sub === null) ? 'null' : this.sub.length) + "]";
    };

    print(indent) {
        if (indent === undefined) indent = '';
        document.writeln(indent + this);
        if (this.sub !== null) {
            indent += '  ';
            for (var i = 0, max = this.sub.length; i < max; ++i)
                this.sub[i].print(indent);
        }
    };

    toPrettyString(indent) {
        if (indent === undefined) indent = '';
        var s = indent + this.typeName() + " @" + this.stream.pos;
        if (this.length >= 0)
            s += "+";
        s += this.length;
        if (this.tag & 0x20)
            s += " (constructed)";
        else if (((this.tag == 0x03) || (this.tag == 0x04)) && (this.sub !== null))
            s += " (encapsulates)";
        s += "\n";
        if (this.sub !== null) {
            indent += '  ';
            for (var i = 0, max = this.sub.length; i < max; ++i)
                s += this.sub[i].toPrettyString(indent);
        }
        return s;
    };

    toDOM() {
        var node = DOM.tag("div", "node");
        node.asn1 = this;
        var head = DOM.tag("div", "head");
        var s = this.typeName().replace(/_/g, " ");
        head.innerHTML = s;
        var content = this.content();
        if (content !== null) {
            content = String(content).replace(/</g, "&lt;");
            var preview = DOM.tag("span", "preview");
            preview.appendChild(DOM.text(content));
            head.appendChild(preview);
        }
        node.appendChild(head);
        this.node = node;
        this.head = head;
        var value = DOM.tag("div", "value");
        s = "Offset: " + this.stream.pos + "<br/>";
        s += "Length: " + this.header + "+";
        if (this.length >= 0)
            s += this.length;
        else
            s += (-this.length) + " (undefined)";
        if (this.tag & 0x20)
            s += "<br/>(constructed)";
        else if (((this.tag == 0x03) || (this.tag == 0x04)) && (this.sub !== null))
            s += "<br/>(encapsulates)";
        //TODO if (this.tag == 0x03) s += "Unused bits: "
        if (content !== null) {
            s += "<br/>Value:<br/><b>" + content + "</b>";
            if ((typeof oids === 'object') && (this.tag == 0x06)) {
                var oid = oids[content];
                if (oid) {
                    if (oid.d) s += "<br/>" + oid.d;
                    if (oid.c) s += "<br/>" + oid.c;
                    if (oid.w) s += "<br/>(warning!)";
                }
            }
        }
        value.innerHTML = s;
        node.appendChild(value);
        var sub = DOM.tag("div", "sub");
        if (this.sub !== null) {
            for (var i = 0, max = this.sub.length; i < max; ++i)
                sub.appendChild(this.sub[i].toDOM());
        }
        node.appendChild(sub);
        head.onclick = function () {
            node.className = (node.className == "node collapsed") ? "node" : "node collapsed";
        };
        return node;
    };

    posStart() {
        return this.stream.pos;
    };

    posContent() {
        return this.stream.pos + this.header;
    };

    posEnd() {
        return this.stream.pos + this.header + Math.abs(this.length);
    };

    fakeHover(current) {
        this.node.className += " hover";
        if (current)
            this.head.className += " hover";
    };

    fakeOut(current) {
        var re = / ?hover/;
        this.node.className = this.node.className.replace(re, "");
        if (current)
            this.head.className = this.head.className.replace(re, "");
    };

    toHexDOM_sub(node, className, stream, start, end) {
        if (start >= end)
            return;
        var sub = DOM.tag("span", className);
        sub.appendChild(DOM.text(
            stream.hexDump(start, end)));
        node.appendChild(sub);
    };

    toHexDOM(root) {
        var node = DOM.tag("span", "hex");
        if (root === undefined) root = node;
        this.head.hexNode = node;
        this.head.onmouseover = function () {
            this.hexNode.className = "hexCurrent";
        };
        this.head.onmouseout = function () {
            this.hexNode.className = "hex";
        };
        node.asn1 = this;
        node.onmouseover = function () {
            var current = !root.selected;
            if (current) {
                root.selected = this.asn1;
                this.className = "hexCurrent";
            }
            this.asn1.fakeHover(current);
        };
        node.onmouseout = function () {
            var current = (root.selected == this.asn1);
            this.asn1.fakeOut(current);
            if (current) {
                root.selected = null;
                this.className = "hex";
            }
        };
        this.toHexDOM_sub(node, "tag", this.stream, this.posStart(), this.posStart() + 1);
        this.toHexDOM_sub(node, (this.length >= 0) ? "dlen" : "ulen", this.stream, this.posStart() + 1, this.posContent());
        if (this.sub === null)
            node.appendChild(DOM.text(
                this.stream.hexDump(this.posContent(), this.posEnd())));
        else if (this.sub.length > 0) {
            var first = this.sub[0];
            var last = this.sub[this.sub.length - 1];
            this.toHexDOM_sub(node, "intro", this.stream, this.posContent(), first.posStart());
            for (var i = 0, max = this.sub.length; i < max; ++i)
                node.appendChild(this.sub[i].toHexDOM(root));
            this.toHexDOM_sub(node, "outro", this.stream, last.posEnd(), this.posEnd());
        }
        return node;
    };

    toHexString(root) {
        return this.stream.hexDump(this.posStart(), this.posEnd(), true);
    };

}

ASN1.decodeLength = function (stream) {
    var buf = stream.get(),
        len = buf & 0x7F;
    if (len == buf)
        return len;
    if (len > 3)
        throw "Length over 24 bits not supported at position " + (stream.pos - 1);
    if (len === 0)
        return -1; // undefined
    buf = 0;
    for (var i = 0; i < len; ++i)
        buf = (buf << 8) | stream.get();
    return buf;
};
ASN1.hasContent = function (tag, len, stream) {
    if (tag & 0x20) // constructed
        return true;
    if ((tag < 0x03) || (tag > 0x04))
        return false;
    var p = new Stream(stream);
    if (tag == 0x03) p.get(); // BitString unused bits, must be in [0, 7]
    var subTag = p.get();
    if ((subTag >> 6) & 0x01) // not (universal or context)
        return false;
    try {
        var subLength = ASN1.decodeLength(p);
        return ((p.pos - stream.pos) + subLength == len);
    } catch (exception) {
        return false;
    }
};
ASN1.decode = function (stream) {
    if (!(stream instanceof Stream))
        stream = new Stream(stream, 0);
    var streamStart = new Stream(stream),
        tag = stream.get(),
        len = ASN1.decodeLength(stream),
        header = stream.pos - streamStart.pos,
        sub = null;
    if (ASN1.hasContent(tag, len, stream)) {
        // it has content, so we decode it
        var start = stream.pos;
        if (tag == 0x03) stream.get(); // skip BitString unused bits, must be in [0, 7]
        sub = [];
        if (len >= 0) {
            // definite length
            var end = start + len;
            while (stream.pos < end)
                sub[sub.length] = ASN1.decode(stream);
            if (stream.pos != end)
                throw "Content size is not correct for container starting at offset " + start;
        } else {
            // undefined length
            try {
                for (; ;) {
                    var s = ASN1.decode(stream);
                    if (s.tag === 0)
                        break;
                    sub[sub.length] = s;
                }
                len = start - stream.pos;
            } catch (e) {
                throw "Exception while decoding undefined length content: " + e;
            }
        }
    } else
        stream.pos += len; // skip content
    return new ASN1(streamStart, header, len, tag, sub);
};
ASN1.test = function () {
    var test = [
        {value: [0x27], expected: 0x27},
        {value: [0x81, 0xC9], expected: 0xC9},
        {value: [0x83, 0xFE, 0xDC, 0xBA], expected: 0xFEDCBA}
    ];
    for (var i = 0, max = test.length; i < max; ++i) {
        var stream = new Stream(test[i].value, 0),
            res = ASN1.decodeLength(stream);
        if (res != test[i].expected)
            document.write("In test[" + i + "] expected " + test[i].expected + " got " + res + "\n");
    }
};

// prng4.js - uses Arcfour as a PRNG

class Arcfour {
  constructor() {
    this.i = 0;
    this.j = 0;
    this.S = [];
  }
}

// Initialize arcfour context from key, an array of ints, each from [0..255]
function ARC4init(key) {
  var i, j, t;
  for(i = 0; i < 256; ++i)
    this.S[i] = i;
  j = 0;
  for(i = 0; i < 256; ++i) {
    j = (j + this.S[i] + key[i % key.length]) & 255;
    t = this.S[i];
    this.S[i] = this.S[j];
    this.S[j] = t;
  }
  this.i = 0;
  this.j = 0;
}

function ARC4next() {
  var t;
  this.i = (this.i + 1) & 255;
  this.j = (this.j + this.S[this.i]) & 255;
  t = this.S[this.i];
  this.S[this.i] = this.S[this.j];
  this.S[this.j] = t;
  return this.S[(t + this.S[this.i]) & 255];
}

Arcfour.prototype.init = ARC4init;
Arcfour.prototype.next = ARC4next;

// Plug in your RNG constructor here
function prng_newstate() {
  return new Arcfour();
}

// Pool size must be a multiple of 4 and greater than 32.
// An array of bytes the size of the pool will be passed to init()
var rng_psize = 256;

// Random number generator - requires a PRNG backend, e.g. prng4.js
var rng_state;
var rng_pool;
var rng_pptr;

// Initialize the pool with junk if needed.
if(rng_pool == null) {
  rng_pool = new Array();
  rng_pptr = 0;
  var t;
  if(window.crypto && window.crypto.getRandomValues) {
    // Extract entropy (2048 bits) from RNG if available
    var z = new Uint32Array(256);
    window.crypto.getRandomValues(z);
    for (t = 0; t < z.length; ++t)
      rng_pool[rng_pptr++] = z[t] & 255;
  }

  // Use mouse events for entropy, if we do not have enough entropy by the time
  // we need it, entropy will be generated by Math.random.
  var onMouseMoveListener = function(ev) {
    this.count = this.count || 0;
    if (this.count >= 256 || rng_pptr >= rng_psize) {
      if (window.removeEventListener)
        window.removeEventListener("mousemove", onMouseMoveListener, false);
      else if (window.detachEvent)
        window.detachEvent("onmousemove", onMouseMoveListener);
      return;
    }
    try {
      var mouseCoordinates = ev.x + ev.y;
      rng_pool[rng_pptr++] = mouseCoordinates & 255;
      this.count += 1;
    } catch (e) {
      // Sometimes Firefox will deny permission to access event properties for some reason. Ignore.
    }
  };
  if (window.addEventListener)
    window.addEventListener("mousemove", onMouseMoveListener, false);
  else if (window.attachEvent)
    window.attachEvent("onmousemove", onMouseMoveListener);

}

function rng_get_byte() {
  if(rng_state == null) {
    rng_state = prng_newstate();
    // At this point, we may not have collected enough entropy.  If not, fall back to Math.random
    while (rng_pptr < rng_psize) {
      var random = Math.floor(65536 * Math.random());
      rng_pool[rng_pptr++] = random & 255;
    }
    rng_state.init(rng_pool);
    for(rng_pptr = 0; rng_pptr < rng_pool.length; ++rng_pptr)
      rng_pool[rng_pptr] = 0;
    rng_pptr = 0;
  }
  // TODO: allow reseeding after first request
  return rng_state.next();
}

function rng_get_bytes(ba) {
  var i;
  for(i = 0; i < ba.length; ++i) ba[i] = rng_get_byte();
}

class SecureRandom {
  constructor(){}
}

SecureRandom.prototype.nextBytes = rng_get_bytes;

// Copyright (c) 2005  Tom Wu
// All Rights Reserved.
// See "LICENSE" for details.

// Basic JavaScript BN library - subset useful for RSA encryption.

// Bits per digit
var dbits;

// (public) Constructor
class BigInteger {
  constructor(a,b,c) {
    if (a != null)
      if ("number" == typeof a) this.fromNumber(a, b, c);
      else if (b == null && "string" != typeof a) this.fromString(a, 256);
      else this.fromString(a, b);
  }
}

// return new, unset BigInteger
function nbi() { return new BigInteger(null); }

// am: Compute w_j += (x*this_i), propagate carries,
// c is initial carry, returns final carry.
// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
// We need to select the fastest one that works in this environment.

// am1: use a single mult and divide to get the high bits,
// max digit bits should be 26 because
// max internal value = 2*dvalue^2-2*dvalue (< 2^53)
function am1(i,x,w,j,c,n) {
  while(--n >= 0) {
    var v = x*this[i++]+w[j]+c;
    c = Math.floor(v/0x4000000);
    w[j++] = v&0x3ffffff;
  }
  return c;
}
// am2 avoids a big mult-and-extract completely.
// Max digit bits should be <= 30 because we do bitwise ops
// on values up to 2*hdvalue^2-hdvalue-1 (< 2^31)
function am2(i,x,w,j,c,n) {
  var xl = x&0x7fff, xh = x>>15;
  while(--n >= 0) {
    var l = this[i]&0x7fff;
    var h = this[i++]>>15;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x7fff)<<15)+w[j]+(c&0x3fffffff);
    c = (l>>>30)+(m>>>15)+xh*h+(c>>>30);
    w[j++] = l&0x3fffffff;
  }
  return c;
}
// Alternately, set max digit bits to 28 since some
// browsers slow down when dealing with 32-bit numbers.
function am3(i,x,w,j,c,n) {
  var xl = x&0x3fff, xh = x>>14;
  while(--n >= 0) {
    var l = this[i]&0x3fff;
    var h = this[i++]>>14;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x3fff)<<14)+w[j]+c;
    c = (l>>28)+(m>>14)+xh*h;
    w[j++] = l&0xfffffff;
  }
  return c;
}
if((navigator.appName == "Microsoft Internet Explorer")) {
  BigInteger.prototype.am = am2;
  dbits = 30;
}
else if((navigator.appName != "Netscape")) {
  BigInteger.prototype.am = am1;
  dbits = 26;
}
else { // Mozilla/Netscape seems to prefer am3
  BigInteger.prototype.am = am3;
  dbits = 28;
}

BigInteger.prototype.DB = dbits;
BigInteger.prototype.DM = ((1<<dbits)-1);
BigInteger.prototype.DV = (1<<dbits);

var BI_FP = 52;
BigInteger.prototype.FV = Math.pow(2,BI_FP);
BigInteger.prototype.F1 = BI_FP-dbits;
BigInteger.prototype.F2 = 2*dbits-BI_FP;

// Digit conversions
var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
var BI_RC = [];
var rr,vv;
rr = "0".charCodeAt(0);
for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
rr = "a".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
rr = "A".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

function int2char(n) { return BI_RM.charAt(n); }
function intAt(s,i) {
  var c = BI_RC[s.charCodeAt(i)];
  return (c==null)?-1:c;
}

// (protected) copy this to r
function bnpCopyTo(r) {
  for(var i = this.t-1; i >= 0; --i) r[i] = this[i];
  r.t = this.t;
  r.s = this.s;
}

// (protected) set from integer value x, -DV <= x < DV
function bnpFromInt(x) {
  this.t = 1;
  this.s = (x<0)?-1:0;
  if(x > 0) this[0] = x;
  else if(x < -1) this[0] = x+this.DV;
  else this.t = 0;
}

// return bigint initialized to value
function nbv(i) { var r = nbi(); r.fromInt(i); return r; }

// (protected) set from string and radix
function bnpFromString(s,b) {
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 256) k = 8; // byte array
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else { this.fromRadix(s,b); return; }
  this.t = 0;
  this.s = 0;
  var i = s.length, mi = false, sh = 0;
  while(--i >= 0) {
    var x = (k==8)?s[i]&0xff:intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-") mi = true;
      continue;
    }
    mi = false;
    if(sh == 0)
      this[this.t++] = x;
    else if(sh+k > this.DB) {
      this[this.t-1] |= (x&((1<<(this.DB-sh))-1))<<sh;
      this[this.t++] = (x>>(this.DB-sh));
    }
    else
      this[this.t-1] |= x<<sh;
    sh += k;
    if(sh >= this.DB) sh -= this.DB;
  }
  if(k == 8 && (s[0]&0x80) != 0) {
    this.s = -1;
    if(sh > 0) this[this.t-1] |= ((1<<(this.DB-sh))-1)<<sh;
  }
  this.clamp();
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) clamp off excess high words
function bnpClamp() {
  var c = this.s&this.DM;
  while(this.t > 0 && this[this.t-1] == c) --this.t;
}

// (public) return string representation in given radix
function bnToString(b) {
  if(this.s < 0) return "-"+this.negate().toString(b);
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else return this.toRadix(b);
  var km = (1<<k)-1, d, m = false, r = "", i = this.t;
  var p = this.DB-(i*this.DB)%k;
  if(i-- > 0) {
    if(p < this.DB && (d = this[i]>>p) > 0) { m = true; r = int2char(d); }
    while(i >= 0) {
      if(p < k) {
        d = (this[i]&((1<<p)-1))<<(k-p);
        d |= this[--i]>>(p+=this.DB-k);
      }
      else {
        d = (this[i]>>(p-=k))&km;
        if(p <= 0) { p += this.DB; --i; }
      }
      if(d > 0) m = true;
      if(m) r += int2char(d);
    }
  }
  return m?r:"0";
}

// (public) -this
function bnNegate() { var r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

// (public) |this|
function bnAbs() { return (this.s<0)?this.negate():this; }

// (public) return + if this > a, - if this < a, 0 if equal
function bnCompareTo(a) {
  var r = this.s-a.s;
  if(r != 0) return r;
  var i = this.t;
  r = i-a.t;
  if(r != 0) return (this.s<0)?-r:r;
  while(--i >= 0) if((r=this[i]-a[i]) != 0) return r;
  return 0;
}

// returns bit length of the integer x
function nbits(x) {
  var r = 1, t;
  if((t=x>>>16) != 0) { x = t; r += 16; }
  if((t=x>>8) != 0) { x = t; r += 8; }
  if((t=x>>4) != 0) { x = t; r += 4; }
  if((t=x>>2) != 0) { x = t; r += 2; }
  if((t=x>>1) != 0) { x = t; r += 1; }
  return r;
}

// (public) return the number of bits in "this"
function bnBitLength() {
  if(this.t <= 0) return 0;
  return this.DB*(this.t-1)+nbits(this[this.t-1]^(this.s&this.DM));
}

// (protected) r = this << n*DB
function bnpDLShiftTo(n,r) {
  var i;
  for(i = this.t-1; i >= 0; --i) r[i+n] = this[i];
  for(i = n-1; i >= 0; --i) r[i] = 0;
  r.t = this.t+n;
  r.s = this.s;
}

// (protected) r = this >> n*DB
function bnpDRShiftTo(n,r) {
  for(var i = n; i < this.t; ++i) r[i-n] = this[i];
  r.t = Math.max(this.t-n,0);
  r.s = this.s;
}

// (protected) r = this << n
function bnpLShiftTo(n,r) {
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<cbs)-1;
  var ds = Math.floor(n/this.DB), c = (this.s<<bs)&this.DM, i;
  for(i = this.t-1; i >= 0; --i) {
    r[i+ds+1] = (this[i]>>cbs)|c;
    c = (this[i]&bm)<<bs;
  }
  for(i = ds-1; i >= 0; --i) r[i] = 0;
  r[ds] = c;
  r.t = this.t+ds+1;
  r.s = this.s;
  r.clamp();
}

// (protected) r = this >> n
function bnpRShiftTo(n,r) {
  r.s = this.s;
  var ds = Math.floor(n/this.DB);
  if(ds >= this.t) { r.t = 0; return; }
  var bs = n%this.DB;
  var cbs = this.DB-bs;
  var bm = (1<<bs)-1;
  r[0] = this[ds]>>bs;
  for(var i = ds+1; i < this.t; ++i) {
    r[i-ds-1] |= (this[i]&bm)<<cbs;
    r[i-ds] = this[i]>>bs;
  }
  if(bs > 0) r[this.t-ds-1] |= (this.s&bm)<<cbs;
  r.t = this.t-ds;
  r.clamp();
}

// (protected) r = this - a
function bnpSubTo(a,r) {
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this[i]-a[i];
    r[i++] = c&this.DM;
    c >>= this.DB;
  }
  if(a.t < this.t) {
    c -= a.s;
    while(i < this.t) {
      c += this[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c -= a[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c -= a.s;
  }
  r.s = (c<0)?-1:0;
  if(c < -1) r[i++] = this.DV+c;
  else if(c > 0) r[i++] = c;
  r.t = i;
  r.clamp();
}

// (protected) r = this * a, r != this,a (HAC 14.12)
// "this" should be the larger one if appropriate.
function bnpMultiplyTo(a,r) {
  var x = this.abs(), y = a.abs();
  var i = x.t;
  r.t = i+y.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < y.t; ++i) r[i+x.t] = x.am(0,y[i],r,i,0,x.t);
  r.s = 0;
  r.clamp();
  if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
}

// (protected) r = this^2, r != this (HAC 14.16)
function bnpSquareTo(r) {
  var x = this.abs();
  var i = r.t = 2*x.t;
  while(--i >= 0) r[i] = 0;
  for(i = 0; i < x.t-1; ++i) {
    var c = x.am(i,x[i],r,2*i,0,1);
    if((r[i+x.t]+=x.am(i+1,2*x[i],r,2*i+1,c,x.t-i-1)) >= x.DV) {
      r[i+x.t] -= x.DV;
      r[i+x.t+1] = 1;
    }
  }
  if(r.t > 0) r[r.t-1] += x.am(i,x[i],r,2*i,0,1);
  r.s = 0;
  r.clamp();
}

// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
// r != q, this != m.  q or r may be null.
function bnpDivRemTo(m,q,r) {
  var pm = m.abs();
  if(pm.t <= 0) return;
  var pt = this.abs();
  if(pt.t < pm.t) {
    if(q != null) q.fromInt(0);
    if(r != null) this.copyTo(r);
    return;
  }
  if(r == null) r = nbi();
  var y = nbi(), ts = this.s, ms = m.s;
  var nsh = this.DB-nbits(pm[pm.t-1]);	// normalize modulus
  if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
  else { pm.copyTo(y); pt.copyTo(r); }
  var ys = y.t;
  var y0 = y[ys-1];
  if(y0 == 0) return;
  var yt = y0*(1<<this.F1)+((ys>1)?y[ys-2]>>this.F2:0);
  var d1 = this.FV/yt, d2 = (1<<this.F1)/yt, e = 1<<this.F2;
  var i = r.t, j = i-ys, t = (q==null)?nbi():q;
  y.dlShiftTo(j,t);
  if(r.compareTo(t) >= 0) {
    r[r.t++] = 1;
    r.subTo(t,r);
  }
  BigInteger.ONE.dlShiftTo(ys,t);
  t.subTo(y,y);	// "negative" y so we can replace sub with am later
  while(y.t < ys) y[y.t++] = 0;
  while(--j >= 0) {
    // Estimate quotient digit
    var qd = (r[--i]==y0)?this.DM:Math.floor(r[i]*d1+(r[i-1]+e)*d2);
    if((r[i]+=y.am(0,qd,r,j,0,ys)) < qd) {	// Try it out
      y.dlShiftTo(j,t);
      r.subTo(t,r);
      while(r[i] < --qd) r.subTo(t,r);
    }
  }
  if(q != null) {
    r.drShiftTo(ys,q);
    if(ts != ms) BigInteger.ZERO.subTo(q,q);
  }
  r.t = ys;
  r.clamp();
  if(nsh > 0) r.rShiftTo(nsh,r);	// Denormalize remainder
  if(ts < 0) BigInteger.ZERO.subTo(r,r);
}

// (public) this mod a
function bnMod(a) {
  var r = nbi();
  this.abs().divRemTo(a,null,r);
  if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
  return r;
}

// Modular reduction using "classic" algorithm
class Classic{
  constructor(m){
    this.m = m;
  }
}
function cConvert(x) {
  if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
  else return x;
}
function cRevert(x) { return x; }
function cReduce(x) { x.divRemTo(this.m,null,x); }
function cMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
function cSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

Classic.prototype.convert = cConvert;
Classic.prototype.revert = cRevert;
Classic.prototype.reduce = cReduce;
Classic.prototype.mulTo = cMulTo;
Classic.prototype.sqrTo = cSqrTo;

// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
// justification:
//         xy == 1 (mod m)
//         xy =  1+km
//   xy(2-xy) = (1+km)(1-km)
// x[y(2-xy)] = 1-k^2m^2
// x[y(2-xy)] == 1 (mod m^2)
// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
// JS multiply "overflows" differently from C/C++, so care is needed here.
function bnpInvDigit() {
  if(this.t < 1) return 0;
  var x = this[0];
  if((x&1) == 0) return 0;
  var y = x&3;		// y == 1/x mod 2^2
  y = (y*(2-(x&0xf)*y))&0xf;	// y == 1/x mod 2^4
  y = (y*(2-(x&0xff)*y))&0xff;	// y == 1/x mod 2^8
  y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;	// y == 1/x mod 2^16
  // last step - calculate inverse mod DV directly;
  // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
  y = (y*(2-x*y%this.DV))%this.DV;		// y == 1/x mod 2^dbits
  // we really want the negative inverse, and -DV < y < DV
  return (y>0)?this.DV-y:-y;
}

// Montgomery reduction
class Montgomery {
  constructor(m) {
    this.m = m;
    this.mp = m.invDigit();
    this.mpl = this.mp & 0x7fff;
    this.mph = this.mp >> 15;
    this.um = (1 << (m.DB - 15)) - 1;
    this.mt2 = 2 * m.t;
  }
}

// xR mod m
function montConvert(x) {
  var r = nbi();
  x.abs().dlShiftTo(this.m.t,r);
  r.divRemTo(this.m,null,r);
  if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
  return r;
}

// x/R mod m
function montRevert(x) {
  var r = nbi();
  x.copyTo(r);
  this.reduce(r);
  return r;
}

// x = x/R mod m (HAC 14.32)
function montReduce(x) {
  while(x.t <= this.mt2)	// pad x so am has enough room later
    x[x.t++] = 0;
  for(var i = 0; i < this.m.t; ++i) {
    // faster way of calculating u0 = x[i]*mp mod DV
    var j = x[i]&0x7fff;
    var u0 = (j*this.mpl+(((j*this.mph+(x[i]>>15)*this.mpl)&this.um)<<15))&x.DM;
    // use am to combine the multiply-shift-add into one call
    j = i+this.m.t;
    x[j] += this.m.am(0,u0,x,i,0,this.m.t);
    // propagate carry
    while(x[j] >= x.DV) { x[j] -= x.DV; x[++j]++; }
  }
  x.clamp();
  x.drShiftTo(this.m.t,x);
  if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = "x^2/R mod m"; x != r
function montSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = "xy/R mod m"; x,y != r
function montMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Montgomery.prototype.convert = montConvert;
Montgomery.prototype.revert = montRevert;
Montgomery.prototype.reduce = montReduce;
Montgomery.prototype.mulTo = montMulTo;
Montgomery.prototype.sqrTo = montSqrTo;

// (protected) true iff this is even
function bnpIsEven() { return ((this.t>0)?(this[0]&1):this.s) == 0; }

// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
function bnpExp(e,z) {
  if(e > 0xffffffff || e < 1) return BigInteger.ONE;
  var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e)-1;
  g.copyTo(r);
  while(--i >= 0) {
    z.sqrTo(r,r2);
    if((e&(1<<i)) > 0) z.mulTo(r2,g,r);
    else { var t = r; r = r2; r2 = t; }
  }
  return z.revert(r);
}

// (public) this^e % m, 0 <= e < 2^32
function bnModPowInt(e,m) {
  var z;
  if(e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
  return this.exp(e,z);
}

// protected
BigInteger.prototype.copyTo = bnpCopyTo;
BigInteger.prototype.fromInt = bnpFromInt;
BigInteger.prototype.fromString = bnpFromString;
BigInteger.prototype.clamp = bnpClamp;
BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
BigInteger.prototype.drShiftTo = bnpDRShiftTo;
BigInteger.prototype.lShiftTo = bnpLShiftTo;
BigInteger.prototype.rShiftTo = bnpRShiftTo;
BigInteger.prototype.subTo = bnpSubTo;
BigInteger.prototype.multiplyTo = bnpMultiplyTo;
BigInteger.prototype.squareTo = bnpSquareTo;
BigInteger.prototype.divRemTo = bnpDivRemTo;
BigInteger.prototype.invDigit = bnpInvDigit;
BigInteger.prototype.isEven = bnpIsEven;
BigInteger.prototype.exp = bnpExp;

// public
BigInteger.prototype.toString = bnToString;
BigInteger.prototype.negate = bnNegate;
BigInteger.prototype.abs = bnAbs;
BigInteger.prototype.compareTo = bnCompareTo;
BigInteger.prototype.bitLength = bnBitLength;
BigInteger.prototype.mod = bnMod;
BigInteger.prototype.modPowInt = bnModPowInt;

// "constants"
BigInteger.ZERO = nbv(0);
BigInteger.ONE = nbv(1);

// Copyright (c) 2005-2009  Tom Wu
// (public)
function bnClone() { var r = nbi(); this.copyTo(r); return r; }

// (public) return value as integer
function bnIntValue() {
  if(this.s < 0) {
    if(this.t == 1) return this[0]-this.DV;
    else if(this.t == 0) return -1;
  }
  else if(this.t == 1) return this[0];
  else if(this.t == 0) return 0;
  // assumes 16 < DB < 32
  return ((this[1]&((1<<(32-this.DB))-1))<<this.DB)|this[0];
}

// (public) return value as byte
function bnByteValue() { return (this.t==0)?this.s:(this[0]<<24)>>24; }

// (public) return value as short (assumes DB>=16)
function bnShortValue() { return (this.t==0)?this.s:(this[0]<<16)>>16; }

// (protected) return x s.t. r^x < DV
function bnpChunkSize(r) { return Math.floor(Math.LN2*this.DB/Math.log(r)); }

// (public) 0 if this == 0, 1 if this > 0
function bnSigNum() {
  if(this.s < 0) return -1;
  else if(this.t <= 0 || (this.t == 1 && this[0] <= 0)) return 0;
  else return 1;
}

// (protected) convert to radix string
function bnpToRadix(b) {
  if(b == null) b = 10;
  if(this.signum() == 0 || b < 2 || b > 36) return "0";
  var cs = this.chunkSize(b);
  var a = Math.pow(b,cs);
  var d = nbv(a), y = nbi(), z = nbi(), r = "";
  this.divRemTo(d,y,z);
  while(y.signum() > 0) {
    r = (a+z.intValue()).toString(b).substr(1) + r;
    y.divRemTo(d,y,z);
  }
  return z.intValue().toString(b) + r;
}

// (protected) convert from radix string
function bnpFromRadix(s,b) {
  this.fromInt(0);
  if(b == null) b = 10;
  var cs = this.chunkSize(b);
  var d = Math.pow(b,cs), mi = false, j = 0, w = 0;
  for(var i = 0; i < s.length; ++i) {
    var x = intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-" && this.signum() == 0) mi = true;
      continue;
    }
    w = b*w+x;
    if(++j >= cs) {
      this.dMultiply(d);
      this.dAddOffset(w,0);
      j = 0;
      w = 0;
    }
  }
  if(j > 0) {
    this.dMultiply(Math.pow(b,j));
    this.dAddOffset(w,0);
  }
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) alternate constructor
function bnpFromNumber(a,b,c) {
  if("number" == typeof b) {
    // new BigInteger(int,int,RNG)
    if(a < 2) this.fromInt(1);
    else {
      this.fromNumber(a,c);
      if(!this.testBit(a-1))	// force MSB set
        this.bitwiseTo(BigInteger.ONE.shiftLeft(a-1),op_or,this);
      if(this.isEven()) this.dAddOffset(1,0); // force odd
      while(!this.isProbablePrime(b)) {
        this.dAddOffset(2,0);
        if(this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a-1),this);
      }
    }
  }
  else {
    // new BigInteger(int,RNG)
    var x = [], t = a&7;
    x.length = (a>>3)+1;
    b.nextBytes(x);
    if(t > 0) x[0] &= ((1<<t)-1); else x[0] = 0;
    this.fromString(x,256);
  }
}

// (public) convert to bigendian byte array
function bnToByteArray() {
  var i = this.t, r = [];
  r[0] = this.s;
  var p = this.DB-(i*this.DB)%8, d, k = 0;
  if(i-- > 0) {
    if(p < this.DB && (d = this[i]>>p) != (this.s&this.DM)>>p)
      r[k++] = d|(this.s<<(this.DB-p));
    while(i >= 0) {
      if(p < 8) {
        d = (this[i]&((1<<p)-1))<<(8-p);
        d |= this[--i]>>(p+=this.DB-8);
      }
      else {
        d = (this[i]>>(p-=8))&0xff;
        if(p <= 0) { p += this.DB; --i; }
      }
      if((d&0x80) != 0) d |= -256;
      if(k == 0 && (this.s&0x80) != (d&0x80)) ++k;
      if(k > 0 || d != this.s) r[k++] = d;
    }
  }
  return r;
}

function bnEquals(a) { return(this.compareTo(a)==0); }
function bnMin(a) { return (this.compareTo(a)<0)?this:a; }
function bnMax(a) { return (this.compareTo(a)>0)?this:a; }

// (protected) r = this op a (bitwise)
function bnpBitwiseTo(a,op,r) {
  var i, f, m = Math.min(a.t,this.t);
  for(i = 0; i < m; ++i) r[i] = op(this[i],a[i]);
  if(a.t < this.t) {
    f = a.s&this.DM;
    for(i = m; i < this.t; ++i) r[i] = op(this[i],f);
    r.t = this.t;
  }
  else {
    f = this.s&this.DM;
    for(i = m; i < a.t; ++i) r[i] = op(f,a[i]);
    r.t = a.t;
  }
  r.s = op(this.s,a.s);
  r.clamp();
}

// (public) this & a
function op_and(x,y) { return x&y; }
function bnAnd(a) { var r = nbi(); this.bitwiseTo(a,op_and,r); return r; }

// (public) this | a
function op_or(x,y) { return x|y; }
function bnOr(a) { var r = nbi(); this.bitwiseTo(a,op_or,r); return r; }

// (public) this ^ a
function op_xor(x,y) { return x^y; }
function bnXor(a) { var r = nbi(); this.bitwiseTo(a,op_xor,r); return r; }

// (public) this & ~a
function op_andnot(x,y) { return x&~y; }
function bnAndNot(a) { var r = nbi(); this.bitwiseTo(a,op_andnot,r); return r; }

// (public) ~this
function bnNot() {
  var r = nbi();
  for(var i = 0; i < this.t; ++i) r[i] = this.DM&~this[i];
  r.t = this.t;
  r.s = ~this.s;
  return r;
}

// (public) this << n
function bnShiftLeft(n) {
  var r = nbi();
  if(n < 0) this.rShiftTo(-n,r); else this.lShiftTo(n,r);
  return r;
}

// (public) this >> n
function bnShiftRight(n) {
  var r = nbi();
  if(n < 0) this.lShiftTo(-n,r); else this.rShiftTo(n,r);
  return r;
}

// return index of lowest 1-bit in x, x < 2^31
function lbit(x) {
  if(x == 0) return -1;
  var r = 0;
  if((x&0xffff) == 0) { x >>= 16; r += 16; }
  if((x&0xff) == 0) { x >>= 8; r += 8; }
  if((x&0xf) == 0) { x >>= 4; r += 4; }
  if((x&3) == 0) { x >>= 2; r += 2; }
  if((x&1) == 0) ++r;
  return r;
}

// (public) returns index of lowest 1-bit (or -1 if none)
function bnGetLowestSetBit() {
  for(var i = 0; i < this.t; ++i)
    if(this[i] != 0) return i*this.DB+lbit(this[i]);
  if(this.s < 0) return this.t*this.DB;
  return -1;
}

// return number of 1 bits in x
function cbit(x) {
  var r = 0;
  while(x != 0) { x &= x-1; ++r; }
  return r;
}

// (public) return number of set bits
function bnBitCount() {
  var r = 0, x = this.s&this.DM;
  for(var i = 0; i < this.t; ++i) r += cbit(this[i]^x);
  return r;
}

// (public) true iff nth bit is set
function bnTestBit(n) {
  var j = Math.floor(n/this.DB);
  if(j >= this.t) return(this.s!=0);
  return((this[j]&(1<<(n%this.DB)))!=0);
}

// (protected) this op (1<<n)
function bnpChangeBit(n,op) {
  var r = BigInteger.ONE.shiftLeft(n);
  this.bitwiseTo(r,op,r);
  return r;
}

// (public) this | (1<<n)
function bnSetBit(n) { return this.changeBit(n,op_or); }

// (public) this & ~(1<<n)
function bnClearBit(n) { return this.changeBit(n,op_andnot); }

// (public) this ^ (1<<n)
function bnFlipBit(n) { return this.changeBit(n,op_xor); }

// (protected) r = this + a
function bnpAddTo(a,r) {
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this[i]+a[i];
    r[i++] = c&this.DM;
    c >>= this.DB;
  }
  if(a.t < this.t) {
    c += a.s;
    while(i < this.t) {
      c += this[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c += a[i];
      r[i++] = c&this.DM;
      c >>= this.DB;
    }
    c += a.s;
  }
  r.s = (c<0)?-1:0;
  if(c > 0) r[i++] = c;
  else if(c < -1) r[i++] = this.DV+c;
  r.t = i;
  r.clamp();
}

// (public) this + a
function bnAdd(a) { var r = nbi(); this.addTo(a,r); return r; }

// (public) this - a
function bnSubtract(a) { var r = nbi(); this.subTo(a,r); return r; }

// (public) this * a
function bnMultiply(a) { var r = nbi(); this.multiplyTo(a,r); return r; }

// (public) this^2
function bnSquare() { var r = nbi(); this.squareTo(r); return r; }

// (public) this / a
function bnDivide(a) { var r = nbi(); this.divRemTo(a,r,null); return r; }

// (public) this % a
function bnRemainder(a) { var r = nbi(); this.divRemTo(a,null,r); return r; }

// (public) [this/a,this%a]
function bnDivideAndRemainder(a) {
  var q = nbi(), r = nbi();
  this.divRemTo(a,q,r);
  return new Array(q,r);
}

// (protected) this *= n, this >= 0, 1 < n < DV
function bnpDMultiply(n) {
  this[this.t] = this.am(0,n-1,this,0,0,this.t);
  ++this.t;
  this.clamp();
}

// (protected) this += n << w words, this >= 0
function bnpDAddOffset(n,w) {
  if(n == 0) return;
  while(this.t <= w) this[this.t++] = 0;
  this[w] += n;
  while(this[w] >= this.DV) {
    this[w] -= this.DV;
    if(++w >= this.t) this[this.t++] = 0;
    ++this[w];
  }
}

// A "null" reducer
function NullExp() {}
function nNop(x) { return x; }
function nMulTo(x,y,r) { x.multiplyTo(y,r); }
function nSqrTo(x,r) { x.squareTo(r); }

NullExp.prototype.convert = nNop;
NullExp.prototype.revert = nNop;
NullExp.prototype.mulTo = nMulTo;
NullExp.prototype.sqrTo = nSqrTo;

// (public) this^e
function bnPow(e) { return this.exp(e,new NullExp()); }

// (protected) r = lower n words of "this * a", a.t <= n
// "this" should be the larger one if appropriate.
function bnpMultiplyLowerTo(a,n,r) {
  var i = Math.min(this.t+a.t,n);
  r.s = 0; // assumes a,this >= 0
  r.t = i;
  while(i > 0) r[--i] = 0;
  var j;
  for(j = r.t-this.t; i < j; ++i) r[i+this.t] = this.am(0,a[i],r,i,0,this.t);
  for(j = Math.min(a.t,n); i < j; ++i) this.am(0,a[i],r,i,0,n-i);
  r.clamp();
}

// (protected) r = "this * a" without lower n words, n > 0
// "this" should be the larger one if appropriate.
function bnpMultiplyUpperTo(a,n,r) {
  --n;
  var i = r.t = this.t+a.t-n;
  r.s = 0; // assumes a,this >= 0
  while(--i >= 0) r[i] = 0;
  for(i = Math.max(n-this.t,0); i < a.t; ++i)
    r[this.t+i-n] = this.am(n-i,a[i],r,0,0,this.t+i-n);
  r.clamp();
  r.drShiftTo(1,r);
}

// Barrett modular reduction
function Barrett(m) {
  // setup Barrett
  this.r2 = nbi();
  this.q3 = nbi();
  BigInteger.ONE.dlShiftTo(2*m.t,this.r2);
  this.mu = this.r2.divide(m);
  this.m = m;
}

function barrettConvert(x) {
  if(x.s < 0 || x.t > 2*this.m.t) return x.mod(this.m);
  else if(x.compareTo(this.m) < 0) return x;
  else { var r = nbi(); x.copyTo(r); this.reduce(r); return r; }
}

function barrettRevert(x) { return x; }

// x = x mod m (HAC 14.42)
function barrettReduce(x) {
  x.drShiftTo(this.m.t-1,this.r2);
  if(x.t > this.m.t+1) { x.t = this.m.t+1; x.clamp(); }
  this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3);
  this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);
  while(x.compareTo(this.r2) < 0) x.dAddOffset(1,this.m.t+1);
  x.subTo(this.r2,x);
  while(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = x^2 mod m; x != r
function barrettSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = x*y mod m; x,y != r
function barrettMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Barrett.prototype.convert = barrettConvert;
Barrett.prototype.revert = barrettRevert;
Barrett.prototype.reduce = barrettReduce;
Barrett.prototype.mulTo = barrettMulTo;
Barrett.prototype.sqrTo = barrettSqrTo;

// (public) this^e % m (HAC 14.85)
function bnModPow(e,m) {
  var i = e.bitLength(), k, r = nbv(1), z;
  if(i <= 0) return r;
  else if(i < 18) k = 1;
  else if(i < 48) k = 3;
  else if(i < 144) k = 4;
  else if(i < 768) k = 5;
  else k = 6;
  if(i < 8)
    z = new Classic(m);
  else if(m.isEven())
    z = new Barrett(m);
  else
    z = new Montgomery(m);

  // precomputation
  var g = [], n = 3, k1 = k-1, km = (1<<k)-1;
  g[1] = z.convert(this);
  if(k > 1) {
    var g2 = nbi();
    z.sqrTo(g[1],g2);
    while(n <= km) {
      g[n] = nbi();
      z.mulTo(g2,g[n-2],g[n]);
      n += 2;
    }
  }

  var j = e.t-1, w, is1 = true, r2 = nbi(), t;
  i = nbits(e[j])-1;
  while(j >= 0) {
    if(i >= k1) w = (e[j]>>(i-k1))&km;
    else {
      w = (e[j]&((1<<(i+1))-1))<<(k1-i);
      if(j > 0) w |= e[j-1]>>(this.DB+i-k1);
    }

    n = k;
    while((w&1) == 0) { w >>= 1; --n; }
    if((i -= n) < 0) { i += this.DB; --j; }
    if(is1) {	// ret == 1, don't bother squaring or multiplying it
      g[w].copyTo(r);
      is1 = false;
    }
    else {
      while(n > 1) { z.sqrTo(r,r2); z.sqrTo(r2,r); n -= 2; }
      if(n > 0) z.sqrTo(r,r2); else { t = r; r = r2; r2 = t; }
      z.mulTo(r2,g[w],r);
    }

    while(j >= 0 && (e[j]&(1<<i)) == 0) {
      z.sqrTo(r,r2); t = r; r = r2; r2 = t;
      if(--i < 0) { i = this.DB-1; --j; }
    }
  }
  return z.revert(r);
}

// (public) gcd(this,a) (HAC 14.54)
function bnGCD(a) {
  var x = (this.s<0)?this.negate():this.clone();
  var y = (a.s<0)?a.negate():a.clone();
  if(x.compareTo(y) < 0) { var t = x; x = y; y = t; }
  var i = x.getLowestSetBit(), g = y.getLowestSetBit();
  if(g < 0) return x;
  if(i < g) g = i;
  if(g > 0) {
    x.rShiftTo(g,x);
    y.rShiftTo(g,y);
  }
  while(x.signum() > 0) {
    if((i = x.getLowestSetBit()) > 0) x.rShiftTo(i,x);
    if((i = y.getLowestSetBit()) > 0) y.rShiftTo(i,y);
    if(x.compareTo(y) >= 0) {
      x.subTo(y,x);
      x.rShiftTo(1,x);
    }
    else {
      y.subTo(x,y);
      y.rShiftTo(1,y);
    }
  }
  if(g > 0) y.lShiftTo(g,y);
  return y;
}

// (protected) this % n, n < 2^26
function bnpModInt(n) {
  if(n <= 0) return 0;
  var d = this.DV%n, r = (this.s<0)?n-1:0;
  if(this.t > 0)
    if(d == 0) r = this[0]%n;
    else for(var i = this.t-1; i >= 0; --i) r = (d*r+this[i])%n;
  return r;
}

// (public) 1/this % m (HAC 14.61)
function bnModInverse(m) {
  var ac = m.isEven();
  if((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
  var u = m.clone(), v = this.clone();
  var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
  while(u.signum() != 0) {
    while(u.isEven()) {
      u.rShiftTo(1,u);
      if(ac) {
        if(!a.isEven() || !b.isEven()) { a.addTo(this,a); b.subTo(m,b); }
        a.rShiftTo(1,a);
      }
      else if(!b.isEven()) b.subTo(m,b);
      b.rShiftTo(1,b);
    }
    while(v.isEven()) {
      v.rShiftTo(1,v);
      if(ac) {
        if(!c.isEven() || !d.isEven()) { c.addTo(this,c); d.subTo(m,d); }
        c.rShiftTo(1,c);
      }
      else if(!d.isEven()) d.subTo(m,d);
      d.rShiftTo(1,d);
    }
    if(u.compareTo(v) >= 0) {
      u.subTo(v,u);
      if(ac) a.subTo(c,a);
      b.subTo(d,b);
    }
    else {
      v.subTo(u,v);
      if(ac) c.subTo(a,c);
      d.subTo(b,d);
    }
  }
  if(v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
  if(d.compareTo(m) >= 0) return d.subtract(m);
  if(d.signum() < 0) d.addTo(m,d); else return d;
  if(d.signum() < 0) return d.add(m); else return d;
}

var lowprimes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509,521,523,541,547,557,563,569,571,577,587,593,599,601,607,613,617,619,631,641,643,647,653,659,661,673,677,683,691,701,709,719,727,733,739,743,751,757,761,769,773,787,797,809,811,821,823,827,829,839,853,857,859,863,877,881,883,887,907,911,919,929,937,941,947,953,967,971,977,983,991,997];
var lplim = (1<<26)/lowprimes[lowprimes.length-1];

// (public) test primality with certainty >= 1-.5^t
function bnIsProbablePrime(t) {
  var i, x = this.abs();
  if(x.t == 1 && x[0] <= lowprimes[lowprimes.length-1]) {
    for(i = 0; i < lowprimes.length; ++i)
      if(x[0] == lowprimes[i]) return true;
    return false;
  }
  if(x.isEven()) return false;
  i = 1;
  while(i < lowprimes.length) {
    var m = lowprimes[i], j = i+1;
    while(j < lowprimes.length && m < lplim) m *= lowprimes[j++];
    m = x.modInt(m);
    while(i < j) if(m%lowprimes[i++] == 0) return false;
  }
  return x.millerRabin(t);
}

// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
function bnpMillerRabin(t) {
  var n1 = this.subtract(BigInteger.ONE);
  var k = n1.getLowestSetBit();
  if(k <= 0) return false;
  var r = n1.shiftRight(k);
  t = (t+1)>>1;
  if(t > lowprimes.length) t = lowprimes.length;
  var a = nbi();
  for(var i = 0; i < t; ++i) {
    //Pick bases at random, instead of starting at 2
    a.fromInt(lowprimes[Math.floor(Math.random()*lowprimes.length)]);
    var y = a.modPow(r,this);
    if(y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
      var j = 1;
      while(j++ < k && y.compareTo(n1) != 0) {
        y = y.modPowInt(2,this);
        if(y.compareTo(BigInteger.ONE) == 0) return false;
      }
      if(y.compareTo(n1) != 0) return false;
    }
  }
  return true;
}

// protected
BigInteger.prototype.chunkSize = bnpChunkSize;
BigInteger.prototype.toRadix = bnpToRadix;
BigInteger.prototype.fromRadix = bnpFromRadix;
BigInteger.prototype.fromNumber = bnpFromNumber;
BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
BigInteger.prototype.changeBit = bnpChangeBit;
BigInteger.prototype.addTo = bnpAddTo;
BigInteger.prototype.dMultiply = bnpDMultiply;
BigInteger.prototype.dAddOffset = bnpDAddOffset;
BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
BigInteger.prototype.modInt = bnpModInt;
BigInteger.prototype.millerRabin = bnpMillerRabin;

// public
BigInteger.prototype.clone = bnClone;
BigInteger.prototype.intValue = bnIntValue;
BigInteger.prototype.byteValue = bnByteValue;
BigInteger.prototype.shortValue = bnShortValue;
BigInteger.prototype.signum = bnSigNum;
BigInteger.prototype.toByteArray = bnToByteArray;
BigInteger.prototype.equals = bnEquals;
BigInteger.prototype.min = bnMin;
BigInteger.prototype.max = bnMax;
BigInteger.prototype.and = bnAnd;
BigInteger.prototype.or = bnOr;
BigInteger.prototype.xor = bnXor;
BigInteger.prototype.andNot = bnAndNot;
BigInteger.prototype.not = bnNot;
BigInteger.prototype.shiftLeft = bnShiftLeft;
BigInteger.prototype.shiftRight = bnShiftRight;
BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
BigInteger.prototype.bitCount = bnBitCount;
BigInteger.prototype.testBit = bnTestBit;
BigInteger.prototype.setBit = bnSetBit;
BigInteger.prototype.clearBit = bnClearBit;
BigInteger.prototype.flipBit = bnFlipBit;
BigInteger.prototype.add = bnAdd;
BigInteger.prototype.subtract = bnSubtract;
BigInteger.prototype.multiply = bnMultiply;
BigInteger.prototype.divide = bnDivide;
BigInteger.prototype.remainder = bnRemainder;
BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
BigInteger.prototype.modPow = bnModPow;
BigInteger.prototype.modInverse = bnModInverse;
BigInteger.prototype.pow = bnPow;
BigInteger.prototype.gcd = bnGCD;
BigInteger.prototype.isProbablePrime = bnIsProbablePrime;

// JSBN-specific extension
BigInteger.prototype.square = bnSquare;

// BigInteger interfaces not implemented in jsbn:

// BigInteger(int signum, byte[] magnitude)
// double doubleValue()
// float floatValue()
// int hashCode()
// long longValue()
// static BigInteger valueOf(long val)

// Version 1.1: support utf-8 encoding in pkcs1pad2

function parseBigInt(str,r) {
  return new BigInteger(str,r);
}

// PKCS#1 (type 2, random) pad input string s to n bytes, and return a bigint
function pkcs1pad2(s,n) {
  if(n < s.length + 11) { // TODO: fix for utf-8
    console.error("Message too long for RSA");
    return null;
  }
  var ba = [];
  var i = s.length - 1;
  while(i >= 0 && n > 0) {
    var c = s.charCodeAt(i--);
    if(c < 128) { // encode using utf-8
      ba[--n] = c;
    }
    else if((c > 127) && (c < 2048)) {
      ba[--n] = (c & 63) | 128;
      ba[--n] = (c >> 6) | 192;
    }
    else {
      ba[--n] = (c & 63) | 128;
      ba[--n] = ((c >> 6) & 63) | 128;
      ba[--n] = (c >> 12) | 224;
    }
  }
  ba[--n] = 0;
  var rng = new SecureRandom();
  var x = [];
  while(n > 2) { // random non-zero pad
    x[0] = 0;
    while(x[0] == 0) rng.nextBytes(x);
    ba[--n] = x[0];
  }
  ba[--n] = 2;
  ba[--n] = 0;
  return new BigInteger(ba);
}

// "empty" RSA key constructor
class RSAKey {
  constructor() {
    this.n = null;
    this.e = 0;
    this.d = null;
    this.p = null;
    this.q = null;
    this.dmp1 = null;
    this.dmq1 = null;
    this.coeff = null;
  }
}

// Set the public key fields N and e from hex strings
function RSASetPublic(N,E) {
  if(N != null && E != null && N.length > 0 && E.length > 0) {
    this.n = parseBigInt(N,16);
    this.e = parseInt(E,16);
  }
  else
    console.error("Invalid RSA public key");
}

// Perform raw public operation on "x": return x^e (mod n)
function RSADoPublic(x) {
  return x.modPowInt(this.e, this.n);
}

// Return the PKCS#1 RSA encryption of "text" as an even-length hex string
function RSAEncrypt(text) {
  var m = pkcs1pad2(text,(this.n.bitLength()+7)>>3);
  if(m == null) return null;
  var c = this.doPublic(m);
  if(c == null) return null;
  var h = c.toString(16);
  if((h.length & 1) == 0) return h; else return "0" + h;
}

// Return the PKCS#1 RSA encryption of "text" as a Base64-encoded string
//function RSAEncryptB64(text) {
//  var h = this.encrypt(text);
//  if(h) return hex2b64(h); else return null;
//}

// protected
RSAKey.prototype.doPublic = RSADoPublic;

// public
RSAKey.prototype.setPublic = RSASetPublic;
RSAKey.prototype.encrypt = RSAEncrypt;
//RSAKey.prototype.encrypt_b64 = RSAEncryptB64;

// Version 1.1: support utf-8 decoding in pkcs1unpad2

function pkcs1unpad2(d,n) {
  var b = d.toByteArray();
  var i = 0;
  while(i < b.length && b[i] == 0) ++i;
  if(b.length-i != n-1 || b[i] != 2)
    return null;
  ++i;
  while(b[i] != 0)
    if(++i >= b.length) return null;
  var ret = "";
  while(++i < b.length) {
    var c = b[i] & 255;
    if(c < 128) { // utf-8 decode
      ret += String.fromCharCode(c);
    }
    else if((c > 191) && (c < 224)) {
      ret += String.fromCharCode(((c & 31) << 6) | (b[i+1] & 63));
      ++i;
    }
    else {
      ret += String.fromCharCode(((c & 15) << 12) | ((b[i+1] & 63) << 6) | (b[i+2] & 63));
      i += 2;
    }
  }
  return ret;
}

// Set the private key fields N, e, and d from hex strings
function RSASetPrivate(N,E,D) {
  if(N != null && E != null && N.length > 0 && E.length > 0) {
    this.n = parseBigInt(N,16);
    this.e = parseInt(E,16);
    this.d = parseBigInt(D,16);
  }
  else
    console.error("Invalid RSA private key");
}

// Set the private key fields N, e, d and CRT params from hex strings
function RSASetPrivateEx(N,E,D,P,Q,DP,DQ,C) {
  if(N != null && E != null && N.length > 0 && E.length > 0) {
    this.n = parseBigInt(N,16);
    this.e = parseInt(E,16);
    this.d = parseBigInt(D,16);
    this.p = parseBigInt(P,16);
    this.q = parseBigInt(Q,16);
    this.dmp1 = parseBigInt(DP,16);
    this.dmq1 = parseBigInt(DQ,16);
    this.coeff = parseBigInt(C,16);
  }
  else
    console.error("Invalid RSA private key");
}

// Generate a new random private key B bits long, using public expt E
function RSAGenerate(B,E) {
  var rng = new SecureRandom();
  var qs = B>>1;
  this.e = parseInt(E,16);
  var ee = new BigInteger(E,16);
  for(;;) {
    for(;;) {
      this.p = new BigInteger(B-qs,1,rng);
      if(this.p.subtract(BigInteger.ONE).gcd(ee).compareTo(BigInteger.ONE) == 0 && this.p.isProbablePrime(10)) break;
    }
    for(;;) {
      this.q = new BigInteger(qs,1,rng);
      if(this.q.subtract(BigInteger.ONE).gcd(ee).compareTo(BigInteger.ONE) == 0 && this.q.isProbablePrime(10)) break;
    }
    if(this.p.compareTo(this.q) <= 0) {
      var t = this.p;
      this.p = this.q;
      this.q = t;
    }
    var p1 = this.p.subtract(BigInteger.ONE);
    var q1 = this.q.subtract(BigInteger.ONE);
    var phi = p1.multiply(q1);
    if(phi.gcd(ee).compareTo(BigInteger.ONE) == 0) {
      this.n = this.p.multiply(this.q);
      this.d = ee.modInverse(phi);
      this.dmp1 = this.d.mod(p1);
      this.dmq1 = this.d.mod(q1);
      this.coeff = this.q.modInverse(this.p);
      break;
    }
  }
}

// Perform raw private operation on "x": return x^d (mod n)
function RSADoPrivate(x) {
  if(this.p == null || this.q == null)
    return x.modPow(this.d, this.n);

  // TODO: re-calculate any missing CRT params
  var xp = x.mod(this.p).modPow(this.dmp1, this.p);
  var xq = x.mod(this.q).modPow(this.dmq1, this.q);

  while(xp.compareTo(xq) < 0)
    xp = xp.add(this.p);
  return xp.subtract(xq).multiply(this.coeff).mod(this.p).multiply(this.q).add(xq);
}

// Return the PKCS#1 RSA decryption of "ctext".
// "ctext" is an even-length hex string and the output is a plain string.
function RSADecrypt(ctext) {
  var c = parseBigInt(ctext, 16);
  var m = this.doPrivate(c);
  if(m == null) return null;
  return pkcs1unpad2(m, (this.n.bitLength()+7)>>3);
}

// Return the PKCS#1 RSA decryption of "ctext".
// "ctext" is a Base64-encoded string and the output is a plain string.
//function RSAB64Decrypt(ctext) {
//  var h = b64tohex(ctext);
//  if(h) return this.decrypt(h); else return null;
//}

// protected
RSAKey.prototype.doPrivate = RSADoPrivate;

// public
RSAKey.prototype.setPrivate = RSASetPrivate;
RSAKey.prototype.setPrivateEx = RSASetPrivateEx;
RSAKey.prototype.generate = RSAGenerate;
RSAKey.prototype.decrypt = RSADecrypt;
//RSAKey.prototype.b64_decrypt = RSAB64Decrypt;

// Base64 JavaScript decoder
// Copyright (c) 2008-2013 Lapo Luchini <lapo@lapo.it>

// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// 
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

/*jshint browser: true, strict: true, immed: true, latedef: true, undef: true, regexdash: false */

const Base64 = {};
let decoder$1;

Base64.decode = function (a) {
    var i;
    if (decoder$1 === undefined) {
        var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
            ignore = "= \f\n\r\t\u00A0\u2028\u2029";
        decoder$1 = [];
        for (i = 0; i < 64; ++i)
            decoder$1[b64.charAt(i)] = i;
        for (i = 0; i < ignore.length; ++i)
            decoder$1[ignore.charAt(i)] = -1;
    }
    var out = [];
    var bits = 0, char_count = 0;
    for (i = 0; i < a.length; ++i) {
        var c = a.charAt(i);
        if (c == '=')
            break;
        c = decoder$1[c];
        if (c == -1)
            continue;
        if (c === undefined)
            throw 'Illegal character at offset ' + i;
        bits |= c;
        if (++char_count >= 4) {
            out[out.length] = (bits >> 16);
            out[out.length] = (bits >> 8) & 0xFF;
            out[out.length] = bits & 0xFF;
            bits = 0;
            char_count = 0;
        } else {
            bits <<= 6;
        }
    }
    switch (char_count) {
      case 1:
        throw "Base64 encoding incomplete: at least 2 bits missing";
      case 2:
        out[out.length] = (bits >> 10);
        break;
      case 3:
        out[out.length] = (bits >> 16);
        out[out.length] = (bits >> 8) & 0xFF;
        break;
    }
    return out;
};

Base64.re = /-----BEGIN [^-]+-----([A-Za-z0-9+\/=\s]+)-----END [^-]+-----|begin-base64[^\n]+\n([A-Za-z0-9+\/=\s]+)====/;
Base64.unarmor = function (a) {
    var m = Base64.re.exec(a);
    if (m) {
        if (m[1])
            a = m[1];
        else if (m[2])
            a = m[2];
        else
            throw "RegExp out of sync";
    }
    return Base64.decode(a);
};

// Hex JavaScript decoder
// Copyright (c) 2008-2013 Lapo Luchini <lapo@lapo.it>

// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
// 
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

/*jshint browser: true, strict: true, immed: true, latedef: true, undef: true, regexdash: false */
const Hex = {};
let decoder;

Hex.decode = function(a) {
    var i;
    if (decoder === undefined) {
        var hex = "0123456789ABCDEF",
            ignore = " \f\n\r\t\u00A0\u2028\u2029";
        decoder = [];
        for (i = 0; i < 16; ++i)
            decoder[hex.charAt(i)] = i;
        hex = hex.toLowerCase();
        for (i = 10; i < 16; ++i)
            decoder[hex.charAt(i)] = i;
        for (i = 0; i < ignore.length; ++i)
            decoder[ignore.charAt(i)] = -1;
    }
    var out = [],
        bits = 0,
        char_count = 0;
    for (i = 0; i < a.length; ++i) {
        var c = a.charAt(i);
        if (c == '=')
            break;
        c = decoder[c];
        if (c == -1)
            continue;
        if (c === undefined)
            throw 'Illegal character at offset ' + i;
        bits |= c;
        if (++char_count >= 2) {
            out[out.length] = bits;
            bits = 0;
            char_count = 0;
        } else {
            bits <<= 4;
        }
    }
    if (char_count)
        throw "Hex encoding incomplete: 4 bits missing";
    return out;
};

/*! asn1-1.0.2.js (c) 2013 Kenji Urushima | kjur.github.com/jsrsasign/license
 */

const JSX = /*window.JSX || */{};
JSX.env = JSX.env || {};

var L = JSX, OP = Object.prototype, FUNCTION_TOSTRING = '[object Function]',ADD = ["toString", "valueOf"];

JSX.env.parseUA = function(agent) {

    var numberify = function(s) {
        var c = 0;
        return parseFloat(s.replace(/\./g, function() {
            return (c++ == 1) ? '' : '.';
        }));
    },

    nav = navigator,
    o = {
        ie: 0,
        opera: 0,
        gecko: 0,
        webkit: 0,
        chrome: 0,
        mobile: null,
        air: 0,
        ipad: 0,
        iphone: 0,
        ipod: 0,
        ios: null,
        android: 0,
        webos: 0,
        caja: nav && nav.cajaVersion,
        secure: false,
        os: null

    },

    ua = agent || (navigator && navigator.userAgent),
    loc = window && window.location,
    href = loc && loc.href,
    m;

    o.secure = href && (href.toLowerCase().indexOf("https") === 0);

    if (ua) {

        if ((/windows|win32/i).test(ua)) {
            o.os = 'windows';
        } else if ((/macintosh/i).test(ua)) {
            o.os = 'macintosh';
        } else if ((/rhino/i).test(ua)) {
            o.os = 'rhino';
        }
        if ((/KHTML/).test(ua)) {
            o.webkit = 1;
        }
        m = ua.match(/AppleWebKit\/([^\s]*)/);
        if (m && m[1]) {
            o.webkit = numberify(m[1]);
            if (/ Mobile\//.test(ua)) {
                o.mobile = 'Apple'; // iPhone or iPod Touch
                m = ua.match(/OS ([^\s]*)/);
                if (m && m[1]) {
                    m = numberify(m[1].replace('_', '.'));
                }
                o.ios = m;
                o.ipad = o.ipod = o.iphone = 0;
                m = ua.match(/iPad|iPod|iPhone/);
                if (m && m[0]) {
                    o[m[0].toLowerCase()] = o.ios;
                }
            } else {
                m = ua.match(/NokiaN[^\/]*|Android \d\.\d|webOS\/\d\.\d/);
                if (m) {
                    o.mobile = m[0];
                }
                if (/webOS/.test(ua)) {
                    o.mobile = 'WebOS';
                    m = ua.match(/webOS\/([^\s]*);/);
                    if (m && m[1]) {
                        o.webos = numberify(m[1]);
                    }
                }
                if (/ Android/.test(ua)) {
                    o.mobile = 'Android';
                    m = ua.match(/Android ([^\s]*);/);
                    if (m && m[1]) {
                        o.android = numberify(m[1]);
                    }
                }
            }
            m = ua.match(/Chrome\/([^\s]*)/);
            if (m && m[1]) {
                o.chrome = numberify(m[1]); // Chrome
            } else {
                m = ua.match(/AdobeAIR\/([^\s]*)/);
                if (m) {
                    o.air = m[0]; // Adobe AIR 1.0 or better
                }
            }
        }
        if (!o.webkit) {
            m = ua.match(/Opera[\s\/]([^\s]*)/);
            if (m && m[1]) {
                o.opera = numberify(m[1]);
                m = ua.match(/Version\/([^\s]*)/);
                if (m && m[1]) {
                    o.opera = numberify(m[1]); // opera 10+
                }
                m = ua.match(/Opera Mini[^;]*/);
                if (m) {
                    o.mobile = m[0]; // ex: Opera Mini/2.0.4509/1316
                }
            } else { // not opera or webkit
                m = ua.match(/MSIE\s([^;]*)/);
                if (m && m[1]) {
                    o.ie = numberify(m[1]);
                } else { // not opera, webkit, or ie
                    m = ua.match(/Gecko\/([^\s]*)/);
                    if (m) {
                        o.gecko = 1; // Gecko detected, look for revision
                        m = ua.match(/rv:([^\s\)]*)/);
                        if (m && m[1]) {
                            o.gecko = numberify(m[1]);
                        }
                    }
                }
            }
        }
    }
    return o;
};

JSX.env.ua = JSX.env.parseUA();

JSX.isFunction = function(o) {
    return (typeof o === 'function') || OP.toString.apply(o) === FUNCTION_TOSTRING;
};

JSX._IEEnumFix = (JSX.env.ua.ie) ? function(r, s) {
    var i, fname, f;
    for (i=0;i<ADD.length;i=i+1) {

        fname = ADD[i];
        f = s[fname];

        if (L.isFunction(f) && f!=OP[fname]) {
            r[fname]=f;
        }
    }
} : function(){};

JSX.extend = function(subc, superc, overrides) {
    if (!superc||!subc) {
        throw new Error("extend failed, please check that " +
                        "all dependencies are included.");
    }
    var F = function() {}, i;
    F.prototype=superc.prototype;
    subc.prototype=new F();
    subc.prototype.constructor=subc;
    subc.superclass=superc.prototype;
    if (superc.prototype.constructor == OP.constructor) {
        superc.prototype.constructor=superc;
    }

    if (overrides) {
        for (i in overrides) {
            if (L.hasOwnProperty(overrides, i)) {
                subc.prototype[i]=overrides[i];
            }
        }

        L._IEEnumFix(subc.prototype, overrides);
    }
};

/*
 * asn1.js - ASN.1 DER encoder classes
 *
 * Copyright (c) 2013 Kenji Urushima (kenji.urushima@gmail.com)
 *
 * This software is licensed under the terms of the MIT License.
 * http://kjur.github.com/jsrsasign/license
 *
 * The above copyright and license notice shall be 
 * included in all copies or substantial portions of the Software.
 */

/**
 * @fileOverview
 * @name asn1-1.0.js
 * @author Kenji Urushima kenji.urushima@gmail.com
 * @version 1.0.2 (2013-May-30)
 * @since 2.1
 * @license <a href="http://kjur.github.io/jsrsasign/license/">MIT License</a>
 */

/** 
 * kjur's class library name space
 * <p>
 * This name space provides following name spaces:
 * <ul>
 * <li>{@link KJUR.asn1} - ASN.1 primitive hexadecimal encoder</li>
 * <li>{@link KJUR.asn1.x509} - ASN.1 structure for X.509 certificate and CRL</li>
 * <li>{@link KJUR.crypto} - Java Cryptographic Extension(JCE) style MessageDigest/Signature 
 * class and utilities</li>
 * </ul>
 * </p> 
 * NOTE: Please ignore method summary and document of this namespace. This caused by a bug of jsdoc2.
  * @name KJUR
 * @namespace kjur's class library name space
 */
// if (typeof KJUR == "undefined" || !KJUR)
const KJUR = {};

/**
 * kjur's ASN.1 class library name space
 * <p>
 * This is ITU-T X.690 ASN.1 DER encoder class library and
 * class structure and methods is very similar to 
 * org.bouncycastle.asn1 package of 
 * well known BouncyCaslte Cryptography Library.
 *
 * <h4>PROVIDING ASN.1 PRIMITIVES</h4>
 * Here are ASN.1 DER primitive classes.
 * <ul>
 * <li>{@link KJUR.asn1.DERBoolean}</li>
 * <li>{@link KJUR.asn1.DERInteger}</li>
 * <li>{@link KJUR.asn1.DERBitString}</li>
 * <li>{@link KJUR.asn1.DEROctetString}</li>
 * <li>{@link KJUR.asn1.DERNull}</li>
 * <li>{@link KJUR.asn1.DERObjectIdentifier}</li>
 * <li>{@link KJUR.asn1.DERUTF8String}</li>
 * <li>{@link KJUR.asn1.DERNumericString}</li>
 * <li>{@link KJUR.asn1.DERPrintableString}</li>
 * <li>{@link KJUR.asn1.DERTeletexString}</li>
 * <li>{@link KJUR.asn1.DERIA5String}</li>
 * <li>{@link KJUR.asn1.DERUTCTime}</li>
 * <li>{@link KJUR.asn1.DERGeneralizedTime}</li>
 * <li>{@link KJUR.asn1.DERSequence}</li>
 * <li>{@link KJUR.asn1.DERSet}</li>
 * </ul>
 *
 * <h4>OTHER ASN.1 CLASSES</h4>
 * <ul>
 * <li>{@link KJUR.asn1.ASN1Object}</li>
 * <li>{@link KJUR.asn1.DERAbstractString}</li>
 * <li>{@link KJUR.asn1.DERAbstractTime}</li>
 * <li>{@link KJUR.asn1.DERAbstractStructured}</li>
 * <li>{@link KJUR.asn1.DERTaggedObject}</li>
 * </ul>
 * </p>
 * NOTE: Please ignore method summary and document of this namespace. This caused by a bug of jsdoc2.
 * @name KJUR.asn1
 * @namespace
 */
if (typeof KJUR.asn1 == "undefined" || !KJUR.asn1) KJUR.asn1 = {};

/**
 * ASN1 utilities class
 * @name KJUR.asn1.ASN1Util
 * @classs ASN1 utilities class
 * @since asn1 1.0.2
 */
KJUR.asn1.ASN1Util = new function() {
    this.integerToByteHex = function(i) {
	var h = i.toString(16);
	if ((h.length % 2) == 1) h = '0' + h;
	return h;
    };
    this.bigIntToMinTwosComplementsHex = function(bigIntegerValue) {
	var h = bigIntegerValue.toString(16);
	if (h.substr(0, 1) != '-') {
	    if (h.length % 2 == 1) {
		h = '0' + h;
	    } else {
		if (! h.match(/^[0-7]/)) {
		    h = '00' + h;
		}
	    }
	} else {
	    var hPos = h.substr(1);
	    var xorLen = hPos.length;
	    if (xorLen % 2 == 1) {
		xorLen += 1;
	    } else {
		if (! h.match(/^[0-7]/)) {
		    xorLen += 2;
		}
	    }
	    var hMask = '';
	    for (var i = 0; i < xorLen; i++) {
		hMask += 'f';
	    }
	    var biMask = new BigInteger(hMask, 16);
	    var biNeg = biMask.xor(bigIntegerValue).add(BigInteger.ONE);
	    h = biNeg.toString(16).replace(/^-/, '');
	}
	return h;
    };
    /**
     * get PEM string from hexadecimal data and header string
     * @name getPEMStringFromHex
     * @memberOf KJUR.asn1.ASN1Util
     * @function
     * @param {String} dataHex hexadecimal string of PEM body
     * @param {String} pemHeader PEM header string (ex. 'RSA PRIVATE KEY')
     * @return {String} PEM formatted string of input data
     * @description
     * @example
     * var pem  = KJUR.asn1.ASN1Util.getPEMStringFromHex('616161', 'RSA PRIVATE KEY');
     * // value of pem will be:
     * -----BEGIN PRIVATE KEY-----
     * YWFh
     * -----END PRIVATE KEY-----
     */
    this.getPEMStringFromHex = function(dataHex, pemHeader) {
	var dataWA = CryptoJS.enc.Hex.parse(dataHex);
	var dataB64 = CryptoJS.enc.Base64.stringify(dataWA);
	var pemBody = dataB64.replace(/(.{64})/g, "$1\r\n");
        pemBody = pemBody.replace(/\r\n$/, '');
	return "-----BEGIN " + pemHeader + "-----\r\n" + 
               pemBody + 
               "\r\n-----END " + pemHeader + "-----\r\n";
    };
};

// ********************************************************************
//  Abstract ASN.1 Classes
// ********************************************************************

// ********************************************************************

/**
 * base class for ASN.1 DER encoder object
 * @name KJUR.asn1.ASN1Object
 * @class base class for ASN.1 DER encoder object
 * @property {Boolean} isModified flag whether internal data was changed
 * @property {String} hTLV hexadecimal string of ASN.1 TLV
 * @property {String} hT hexadecimal string of ASN.1 TLV tag(T)
 * @property {String} hL hexadecimal string of ASN.1 TLV length(L)
 * @property {String} hV hexadecimal string of ASN.1 TLV value(V)
 * @description
 */
KJUR.asn1.ASN1Object = function() {
    var hV = '';

    /**
     * get hexadecimal ASN.1 TLV length(L) bytes from TLV value(V)
     * @name getLengthHexFromValue
     * @memberOf KJUR.asn1.ASN1Object
     * @function
     * @return {String} hexadecimal string of ASN.1 TLV length(L)
     */
    this.getLengthHexFromValue = function() {
	if (typeof this.hV == "undefined" || this.hV == null) {
	    throw "this.hV is null or undefined.";
	}
	if (this.hV.length % 2 == 1) {
	    throw "value hex must be even length: n=" + hV.length + ",v=" + this.hV;
	}
	var n = this.hV.length / 2;
	var hN = n.toString(16);
	if (hN.length % 2 == 1) {
	    hN = "0" + hN;
	}
	if (n < 128) {
	    return hN;
	} else {
	    var hNlen = hN.length / 2;
	    if (hNlen > 15) {
		throw "ASN.1 length too long to represent by 8x: n = " + n.toString(16);
	    }
	    var head = 128 + hNlen;
	    return head.toString(16) + hN;
	}
    };

    /**
     * get hexadecimal string of ASN.1 TLV bytes
     * @name getEncodedHex
     * @memberOf KJUR.asn1.ASN1Object
     * @function
     * @return {String} hexadecimal string of ASN.1 TLV
     */
    this.getEncodedHex = function() {
	if (this.hTLV == null || this.isModified) {
	    this.hV = this.getFreshValueHex();
	    this.hL = this.getLengthHexFromValue();
	    this.hTLV = this.hT + this.hL + this.hV;
	    this.isModified = false;
	    //console.error("first time: " + this.hTLV);
	}
	return this.hTLV;
    };

    /**
     * get hexadecimal string of ASN.1 TLV value(V) bytes
     * @name getValueHex
     * @memberOf KJUR.asn1.ASN1Object
     * @function
     * @return {String} hexadecimal string of ASN.1 TLV value(V) bytes
     */
    this.getValueHex = function() {
	this.getEncodedHex();
	return this.hV;
    };

    this.getFreshValueHex = function() {
	return '';
    };
};

// == BEGIN DERAbstractString ================================================
/**
 * base class for ASN.1 DER string classes
 * @name KJUR.asn1.DERAbstractString
 * @class base class for ASN.1 DER string classes
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @property {String} s internal string of value
 * @extends KJUR.asn1.ASN1Object
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>str - specify initial ASN.1 value(V) by a string</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERAbstractString = function(params) {
    KJUR.asn1.DERAbstractString.superclass.constructor.call(this);

    /**
     * get string value of this string object
     * @name getString
     * @memberOf KJUR.asn1.DERAbstractString
     * @function
     * @return {String} string value of this string object
     */
    this.getString = function() {
	return this.s;
    };

    /**
     * set value by a string
     * @name setString
     * @memberOf KJUR.asn1.DERAbstractString
     * @function
     * @param {String} newS value by a string to set
     */
    this.setString = function(newS) {
	this.hTLV = null;
	this.isModified = true;
	this.s = newS;
	this.hV = stohex(this.s);
    };

    /**
     * set value by a hexadecimal string
     * @name setStringHex
     * @memberOf KJUR.asn1.DERAbstractString
     * @function
     * @param {String} newHexString value by a hexadecimal string to set
     */
    this.setStringHex = function(newHexString) {
	this.hTLV = null;
	this.isModified = true;
	this.s = null;
	this.hV = newHexString;
    };

    this.getFreshValueHex = function() {
	return this.hV;
    };

    if (typeof params != "undefined") {
	if (typeof params['str'] != "undefined") {
	    this.setString(params['str']);
	} else if (typeof params['hex'] != "undefined") {
	    this.setStringHex(params['hex']);
	}
    }
};
JSX.extend(KJUR.asn1.DERAbstractString, KJUR.asn1.ASN1Object);
// == END   DERAbstractString ================================================

// == BEGIN DERAbstractTime ==================================================
/**
 * base class for ASN.1 DER Generalized/UTCTime class
 * @name KJUR.asn1.DERAbstractTime
 * @class base class for ASN.1 DER Generalized/UTCTime class
 * @param {Array} params associative array of parameters (ex. {'str': '130430235959Z'})
 * @extends KJUR.asn1.ASN1Object
 * @description
 * @see KJUR.asn1.ASN1Object - superclass
 */
KJUR.asn1.DERAbstractTime = function(params) {
    KJUR.asn1.DERAbstractTime.superclass.constructor.call(this);

    // --- PRIVATE METHODS --------------------
    this.localDateToUTC = function(d) {
	utc = d.getTime() + (d.getTimezoneOffset() * 60000);
	var utcDate = new Date(utc);
	return utcDate;
    };

    this.formatDate = function(dateObject, type) {
	var pad = this.zeroPadding;
	var d = this.localDateToUTC(dateObject);
	var year = String(d.getFullYear());
	if (type == 'utc') year = year.substr(2, 2);
	var month = pad(String(d.getMonth() + 1), 2);
	var day = pad(String(d.getDate()), 2);
	var hour = pad(String(d.getHours()), 2);
	var min = pad(String(d.getMinutes()), 2);
	var sec = pad(String(d.getSeconds()), 2);
	return year + month + day + hour + min + sec + 'Z';
    };

    this.zeroPadding = function(s, len) {
	if (s.length >= len) return s;
	return new Array(len - s.length + 1).join('0') + s;
    };

    // --- PUBLIC METHODS --------------------
    /**
     * get string value of this string object
     * @name getString
     * @memberOf KJUR.asn1.DERAbstractTime
     * @function
     * @return {String} string value of this time object
     */
    this.getString = function() {
	return this.s;
    };

    /**
     * set value by a string
     * @name setString
     * @memberOf KJUR.asn1.DERAbstractTime
     * @function
     * @param {String} newS value by a string to set such like "130430235959Z"
     */
    this.setString = function(newS) {
	this.hTLV = null;
	this.isModified = true;
	this.s = newS;
	this.hV = stohex(this.s);
    };

    /**
     * set value by a Date object
     * @name setByDateValue
     * @memberOf KJUR.asn1.DERAbstractTime
     * @function
     * @param {Integer} year year of date (ex. 2013)
     * @param {Integer} month month of date between 1 and 12 (ex. 12)
     * @param {Integer} day day of month
     * @param {Integer} hour hours of date
     * @param {Integer} min minutes of date
     * @param {Integer} sec seconds of date
     */
    this.setByDateValue = function(year, month, day, hour, min, sec) {
	var dateObject = new Date(Date.UTC(year, month - 1, day, hour, min, sec, 0));
	this.setByDate(dateObject);
    };

    this.getFreshValueHex = function() {
	return this.hV;
    };
};
JSX.extend(KJUR.asn1.DERAbstractTime, KJUR.asn1.ASN1Object);
// == END   DERAbstractTime ==================================================

// == BEGIN DERAbstractStructured ============================================
/**
 * base class for ASN.1 DER structured class
 * @name KJUR.asn1.DERAbstractStructured
 * @class base class for ASN.1 DER structured class
 * @property {Array} asn1Array internal array of ASN1Object
 * @extends KJUR.asn1.ASN1Object
 * @description
 * @see KJUR.asn1.ASN1Object - superclass
 */
KJUR.asn1.DERAbstractStructured = function(params) {
    KJUR.asn1.DERAbstractString.superclass.constructor.call(this);

    /**
     * set value by array of ASN1Object
     * @name setByASN1ObjectArray
     * @memberOf KJUR.asn1.DERAbstractStructured
     * @function
     * @param {array} asn1ObjectArray array of ASN1Object to set
     */
    this.setByASN1ObjectArray = function(asn1ObjectArray) {
	this.hTLV = null;
	this.isModified = true;
	this.asn1Array = asn1ObjectArray;
    };

    /**
     * append an ASN1Object to internal array
     * @name appendASN1Object
     * @memberOf KJUR.asn1.DERAbstractStructured
     * @function
     * @param {ASN1Object} asn1Object to add
     */
    this.appendASN1Object = function(asn1Object) {
	this.hTLV = null;
	this.isModified = true;
	this.asn1Array.push(asn1Object);
    };

    this.asn1Array = new Array();
    if (typeof params != "undefined") {
	if (typeof params['array'] != "undefined") {
	    this.asn1Array = params['array'];
	}
    }
};
JSX.extend(KJUR.asn1.DERAbstractStructured, KJUR.asn1.ASN1Object);


// ********************************************************************
//  ASN.1 Object Classes
// ********************************************************************

// ********************************************************************
/**
 * class for ASN.1 DER Boolean
 * @name KJUR.asn1.DERBoolean
 * @class class for ASN.1 DER Boolean
 * @extends KJUR.asn1.ASN1Object
 * @description
 * @see KJUR.asn1.ASN1Object - superclass
 */
KJUR.asn1.DERBoolean = function() {
    KJUR.asn1.DERBoolean.superclass.constructor.call(this);
    this.hT = "01";
    this.hTLV = "0101ff";
};
JSX.extend(KJUR.asn1.DERBoolean, KJUR.asn1.ASN1Object);

// ********************************************************************
/**
 * class for ASN.1 DER Integer
 * @name KJUR.asn1.DERInteger
 * @class class for ASN.1 DER Integer
 * @extends KJUR.asn1.ASN1Object
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>int - specify initial ASN.1 value(V) by integer value</li>
 * <li>bigint - specify initial ASN.1 value(V) by BigInteger object</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERInteger = function(params) {
    KJUR.asn1.DERInteger.superclass.constructor.call(this);
    this.hT = "02";

    /**
     * set value by Tom Wu's BigInteger object
     * @name setByBigInteger
     * @memberOf KJUR.asn1.DERInteger
     * @function
     * @param {BigInteger} bigIntegerValue to set
     */
    this.setByBigInteger = function(bigIntegerValue) {
	this.hTLV = null;
	this.isModified = true;
	this.hV = KJUR.asn1.ASN1Util.bigIntToMinTwosComplementsHex(bigIntegerValue);
    };

    /**
     * set value by integer value
     * @name setByInteger
     * @memberOf KJUR.asn1.DERInteger
     * @function
     * @param {Integer} integer value to set
     */
    this.setByInteger = function(intValue) {
	var bi = new BigInteger(String(intValue), 10);
	this.setByBigInteger(bi);
    };

    /**
     * set value by integer value
     * @name setValueHex
     * @memberOf KJUR.asn1.DERInteger
     * @function
     * @param {String} hexadecimal string of integer value
     * @description
     * <br/>
     * NOTE: Value shall be represented by minimum octet length of
     * two's complement representation.
     */
    this.setValueHex = function(newHexString) {
	this.hV = newHexString;
    };

    this.getFreshValueHex = function() {
	return this.hV;
    };

    if (typeof params != "undefined") {
	if (typeof params['bigint'] != "undefined") {
	    this.setByBigInteger(params['bigint']);
	} else if (typeof params['int'] != "undefined") {
	    this.setByInteger(params['int']);
	} else if (typeof params['hex'] != "undefined") {
	    this.setValueHex(params['hex']);
	}
    }
};
JSX.extend(KJUR.asn1.DERInteger, KJUR.asn1.ASN1Object);

// ********************************************************************
/**
 * class for ASN.1 DER encoded BitString primitive
 * @name KJUR.asn1.DERBitString
 * @class class for ASN.1 DER encoded BitString primitive
 * @extends KJUR.asn1.ASN1Object
 * @description 
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>bin - specify binary string (ex. '10111')</li>
 * <li>array - specify array of boolean (ex. [true,false,true,true])</li>
 * <li>hex - specify hexadecimal string of ASN.1 value(V) including unused bits</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERBitString = function(params) {
    KJUR.asn1.DERBitString.superclass.constructor.call(this);
    this.hT = "03";

    /**
     * set ASN.1 value(V) by a hexadecimal string including unused bits
     * @name setHexValueIncludingUnusedBits
     * @memberOf KJUR.asn1.DERBitString
     * @function
     * @param {String} newHexStringIncludingUnusedBits
     */
    this.setHexValueIncludingUnusedBits = function(newHexStringIncludingUnusedBits) {
	this.hTLV = null;
	this.isModified = true;
	this.hV = newHexStringIncludingUnusedBits;
    };

    /**
     * set ASN.1 value(V) by unused bit and hexadecimal string of value
     * @name setUnusedBitsAndHexValue
     * @memberOf KJUR.asn1.DERBitString
     * @function
     * @param {Integer} unusedBits
     * @param {String} hValue
     */
    this.setUnusedBitsAndHexValue = function(unusedBits, hValue) {
	if (unusedBits < 0 || 7 < unusedBits) {
	    throw "unused bits shall be from 0 to 7: u = " + unusedBits;
	}
	var hUnusedBits = "0" + unusedBits;
	this.hTLV = null;
	this.isModified = true;
	this.hV = hUnusedBits + hValue;
    };

    /**
     * set ASN.1 DER BitString by binary string
     * @name setByBinaryString
     * @memberOf KJUR.asn1.DERBitString
     * @function
     * @param {String} binaryString binary value string (i.e. '10111')
     * @description
     * Its unused bits will be calculated automatically by length of 
     * 'binaryValue'. <br/>
     * NOTE: Trailing zeros '0' will be ignored.
     */
    this.setByBinaryString = function(binaryString) {
	binaryString = binaryString.replace(/0+$/, '');
	var unusedBits = 8 - binaryString.length % 8;
	if (unusedBits == 8) unusedBits = 0;
	for (var i = 0; i <= unusedBits; i++) {
	    binaryString += '0';
	}
	var h = '';
	for (var i = 0; i < binaryString.length - 1; i += 8) {
	    var b = binaryString.substr(i, 8);
	    var x = parseInt(b, 2).toString(16);
	    if (x.length == 1) x = '0' + x;
	    h += x;  
	}
	this.hTLV = null;
	this.isModified = true;
	this.hV = '0' + unusedBits + h;
    };

    /**
     * set ASN.1 TLV value(V) by an array of boolean
     * @name setByBooleanArray
     * @memberOf KJUR.asn1.DERBitString
     * @function
     * @param {array} booleanArray array of boolean (ex. [true, false, true])
     * @description
     * NOTE: Trailing falses will be ignored.
     */
    this.setByBooleanArray = function(booleanArray) {
	var s = '';
	for (var i = 0; i < booleanArray.length; i++) {
	    if (booleanArray[i] == true) {
		s += '1';
	    } else {
		s += '0';
	    }
	}
	this.setByBinaryString(s);
    };

    /**
     * generate an array of false with specified length
     * @name newFalseArray
     * @memberOf KJUR.asn1.DERBitString
     * @function
     * @param {Integer} nLength length of array to generate
     * @return {array} array of boolean faluse
     * @description
     * This static method may be useful to initialize boolean array.
     */
    this.newFalseArray = function(nLength) {
	var a = new Array(nLength);
	for (var i = 0; i < nLength; i++) {
	    a[i] = false;
	}
	return a;
    };

    this.getFreshValueHex = function() {
	return this.hV;
    };

    if (typeof params != "undefined") {
	if (typeof params['hex'] != "undefined") {
	    this.setHexValueIncludingUnusedBits(params['hex']);
	} else if (typeof params['bin'] != "undefined") {
	    this.setByBinaryString(params['bin']);
	} else if (typeof params['array'] != "undefined") {
	    this.setByBooleanArray(params['array']);
	}
    }
};
JSX.extend(KJUR.asn1.DERBitString, KJUR.asn1.ASN1Object);

// ********************************************************************
/**
 * class for ASN.1 DER OctetString
 * @name KJUR.asn1.DEROctetString
 * @class class for ASN.1 DER OctetString
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @extends KJUR.asn1.DERAbstractString
 * @description
 * @see KJUR.asn1.DERAbstractString - superclass
 */
KJUR.asn1.DEROctetString = function(params) {
    KJUR.asn1.DEROctetString.superclass.constructor.call(this, params);
    this.hT = "04";
};
JSX.extend(KJUR.asn1.DEROctetString, KJUR.asn1.DERAbstractString);

// ********************************************************************
/**
 * class for ASN.1 DER Null
 * @name KJUR.asn1.DERNull
 * @class class for ASN.1 DER Null
 * @extends KJUR.asn1.ASN1Object
 * @description
 * @see KJUR.asn1.ASN1Object - superclass
 */
KJUR.asn1.DERNull = function() {
    KJUR.asn1.DERNull.superclass.constructor.call(this);
    this.hT = "05";
    this.hTLV = "0500";
};
JSX.extend(KJUR.asn1.DERNull, KJUR.asn1.ASN1Object);

// ********************************************************************
/**
 * class for ASN.1 DER ObjectIdentifier
 * @name KJUR.asn1.DERObjectIdentifier
 * @class class for ASN.1 DER ObjectIdentifier
 * @param {Array} params associative array of parameters (ex. {'oid': '2.5.4.5'})
 * @extends KJUR.asn1.ASN1Object
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>oid - specify initial ASN.1 value(V) by a oid string (ex. 2.5.4.13)</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERObjectIdentifier = function(params) {
    var itox = function(i) {
	var h = i.toString(16);
	if (h.length == 1) h = '0' + h;
	return h;
    };
    var roidtox = function(roid) {
	var h = '';
	var bi = new BigInteger(roid, 10);
	var b = bi.toString(2);
	var padLen = 7 - b.length % 7;
	if (padLen == 7) padLen = 0;
	var bPad = '';
	for (var i = 0; i < padLen; i++) bPad += '0';
	b = bPad + b;
	for (var i = 0; i < b.length - 1; i += 7) {
	    var b8 = b.substr(i, 7);
	    if (i != b.length - 7) b8 = '1' + b8;
	    h += itox(parseInt(b8, 2));
	}
	return h;
    };

    KJUR.asn1.DERObjectIdentifier.superclass.constructor.call(this);
    this.hT = "06";

    /**
     * set value by a hexadecimal string
     * @name setValueHex
     * @memberOf KJUR.asn1.DERObjectIdentifier
     * @function
     * @param {String} newHexString hexadecimal value of OID bytes
     */
    this.setValueHex = function(newHexString) {
	this.hTLV = null;
	this.isModified = true;
	this.s = null;
	this.hV = newHexString;
    };

    /**
     * set value by a OID string
     * @name setValueOidString
     * @memberOf KJUR.asn1.DERObjectIdentifier
     * @function
     * @param {String} oidString OID string (ex. 2.5.4.13)
     */
    this.setValueOidString = function(oidString) {
	if (! oidString.match(/^[0-9.]+$/)) {
	    throw "malformed oid string: " + oidString;
	}
	var h = '';
	var a = oidString.split('.');
	var i0 = parseInt(a[0]) * 40 + parseInt(a[1]);
	h += itox(i0);
	a.splice(0, 2);
	for (var i = 0; i < a.length; i++) {
	    h += roidtox(a[i]);
	}
	this.hTLV = null;
	this.isModified = true;
	this.s = null;
	this.hV = h;
    };

    /**
     * set value by a OID name
     * @name setValueName
     * @memberOf KJUR.asn1.DERObjectIdentifier
     * @function
     * @param {String} oidName OID name (ex. 'serverAuth')
     * @since 1.0.1
     * @description
     * OID name shall be defined in 'KJUR.asn1.x509.OID.name2oidList'.
     * Otherwise raise error.
     */
    this.setValueName = function(oidName) {
	if (typeof KJUR.asn1.x509.OID.name2oidList[oidName] != "undefined") {
	    var oid = KJUR.asn1.x509.OID.name2oidList[oidName];
	    this.setValueOidString(oid);
	} else {
	    throw "DERObjectIdentifier oidName undefined: " + oidName;
	}
    };

    this.getFreshValueHex = function() {
	return this.hV;
    };

    if (typeof params != "undefined") {
	if (typeof params['oid'] != "undefined") {
	    this.setValueOidString(params['oid']);
	} else if (typeof params['hex'] != "undefined") {
	    this.setValueHex(params['hex']);
	} else if (typeof params['name'] != "undefined") {
	    this.setValueName(params['name']);
	}
    }
};
JSX.extend(KJUR.asn1.DERObjectIdentifier, KJUR.asn1.ASN1Object);

// ********************************************************************
/**
 * class for ASN.1 DER UTF8String
 * @name KJUR.asn1.DERUTF8String
 * @class class for ASN.1 DER UTF8String
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @extends KJUR.asn1.DERAbstractString
 * @description
 * @see KJUR.asn1.DERAbstractString - superclass
 */
KJUR.asn1.DERUTF8String = function(params) {
    KJUR.asn1.DERUTF8String.superclass.constructor.call(this, params);
    this.hT = "0c";
};
JSX.extend(KJUR.asn1.DERUTF8String, KJUR.asn1.DERAbstractString);

// ********************************************************************
/**
 * class for ASN.1 DER NumericString
 * @name KJUR.asn1.DERNumericString
 * @class class for ASN.1 DER NumericString
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @extends KJUR.asn1.DERAbstractString
 * @description
 * @see KJUR.asn1.DERAbstractString - superclass
 */
KJUR.asn1.DERNumericString = function(params) {
    KJUR.asn1.DERNumericString.superclass.constructor.call(this, params);
    this.hT = "12";
};
JSX.extend(KJUR.asn1.DERNumericString, KJUR.asn1.DERAbstractString);

// ********************************************************************
/**
 * class for ASN.1 DER PrintableString
 * @name KJUR.asn1.DERPrintableString
 * @class class for ASN.1 DER PrintableString
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @extends KJUR.asn1.DERAbstractString
 * @description
 * @see KJUR.asn1.DERAbstractString - superclass
 */
KJUR.asn1.DERPrintableString = function(params) {
    KJUR.asn1.DERPrintableString.superclass.constructor.call(this, params);
    this.hT = "13";
};
JSX.extend(KJUR.asn1.DERPrintableString, KJUR.asn1.DERAbstractString);

// ********************************************************************
/**
 * class for ASN.1 DER TeletexString
 * @name KJUR.asn1.DERTeletexString
 * @class class for ASN.1 DER TeletexString
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @extends KJUR.asn1.DERAbstractString
 * @description
 * @see KJUR.asn1.DERAbstractString - superclass
 */
KJUR.asn1.DERTeletexString = function(params) {
    KJUR.asn1.DERTeletexString.superclass.constructor.call(this, params);
    this.hT = "14";
};
JSX.extend(KJUR.asn1.DERTeletexString, KJUR.asn1.DERAbstractString);

// ********************************************************************
/**
 * class for ASN.1 DER IA5String
 * @name KJUR.asn1.DERIA5String
 * @class class for ASN.1 DER IA5String
 * @param {Array} params associative array of parameters (ex. {'str': 'aaa'})
 * @extends KJUR.asn1.DERAbstractString
 * @description
 * @see KJUR.asn1.DERAbstractString - superclass
 */
KJUR.asn1.DERIA5String = function(params) {
    KJUR.asn1.DERIA5String.superclass.constructor.call(this, params);
    this.hT = "16";
};
JSX.extend(KJUR.asn1.DERIA5String, KJUR.asn1.DERAbstractString);

// ********************************************************************
/**
 * class for ASN.1 DER UTCTime
 * @name KJUR.asn1.DERUTCTime
 * @class class for ASN.1 DER UTCTime
 * @param {Array} params associative array of parameters (ex. {'str': '130430235959Z'})
 * @extends KJUR.asn1.DERAbstractTime
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>str - specify initial ASN.1 value(V) by a string (ex.'130430235959Z')</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * <li>date - specify Date object.</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 * <h4>EXAMPLES</h4>
 * @example
 * var d1 = new KJUR.asn1.DERUTCTime();
 * d1.setString('130430125959Z');
 *
 * var d2 = new KJUR.asn1.DERUTCTime({'str': '130430125959Z'});
 *
 * var d3 = new KJUR.asn1.DERUTCTime({'date': new Date(Date.UTC(2015, 0, 31, 0, 0, 0, 0))});
 */
KJUR.asn1.DERUTCTime = function(params) {
    KJUR.asn1.DERUTCTime.superclass.constructor.call(this, params);
    this.hT = "17";

    /**
     * set value by a Date object
     * @name setByDate
     * @memberOf KJUR.asn1.DERUTCTime
     * @function
     * @param {Date} dateObject Date object to set ASN.1 value(V)
     */
    this.setByDate = function(dateObject) {
	this.hTLV = null;
	this.isModified = true;
	this.date = dateObject;
	this.s = this.formatDate(this.date, 'utc');
	this.hV = stohex(this.s);
    };

    if (typeof params != "undefined") {
	if (typeof params['str'] != "undefined") {
	    this.setString(params['str']);
	} else if (typeof params['hex'] != "undefined") {
	    this.setStringHex(params['hex']);
	} else if (typeof params['date'] != "undefined") {
	    this.setByDate(params['date']);
	}
    }
};
JSX.extend(KJUR.asn1.DERUTCTime, KJUR.asn1.DERAbstractTime);

// ********************************************************************
/**
 * class for ASN.1 DER GeneralizedTime
 * @name KJUR.asn1.DERGeneralizedTime
 * @class class for ASN.1 DER GeneralizedTime
 * @param {Array} params associative array of parameters (ex. {'str': '20130430235959Z'})
 * @extends KJUR.asn1.DERAbstractTime
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>str - specify initial ASN.1 value(V) by a string (ex.'20130430235959Z')</li>
 * <li>hex - specify initial ASN.1 value(V) by a hexadecimal string</li>
 * <li>date - specify Date object.</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERGeneralizedTime = function(params) {
    KJUR.asn1.DERGeneralizedTime.superclass.constructor.call(this, params);
    this.hT = "18";

    /**
     * set value by a Date object
     * @name setByDate
     * @memberOf KJUR.asn1.DERGeneralizedTime
     * @function
     * @param {Date} dateObject Date object to set ASN.1 value(V)
     * @example
     * When you specify UTC time, use 'Date.UTC' method like this:<br/>
     * var o = new DERUTCTime();
     * var date = new Date(Date.UTC(2015, 0, 31, 23, 59, 59, 0)); #2015JAN31 23:59:59
     * o.setByDate(date);
     */
    this.setByDate = function(dateObject) {
	this.hTLV = null;
	this.isModified = true;
	this.date = dateObject;
	this.s = this.formatDate(this.date, 'gen');
	this.hV = stohex(this.s);
    };

    if (typeof params != "undefined") {
	if (typeof params['str'] != "undefined") {
	    this.setString(params['str']);
	} else if (typeof params['hex'] != "undefined") {
	    this.setStringHex(params['hex']);
	} else if (typeof params['date'] != "undefined") {
	    this.setByDate(params['date']);
	}
    }
};
JSX.extend(KJUR.asn1.DERGeneralizedTime, KJUR.asn1.DERAbstractTime);

// ********************************************************************
/**
 * class for ASN.1 DER Sequence
 * @name KJUR.asn1.DERSequence
 * @class class for ASN.1 DER Sequence
 * @extends KJUR.asn1.DERAbstractStructured
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>array - specify array of ASN1Object to set elements of content</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERSequence = function(params) {
    KJUR.asn1.DERSequence.superclass.constructor.call(this, params);
    this.hT = "30";
    this.getFreshValueHex = function() {
	var h = '';
	for (var i = 0; i < this.asn1Array.length; i++) {
	    var asn1Obj = this.asn1Array[i];
	    h += asn1Obj.getEncodedHex();
	}
	this.hV = h;
	return this.hV;
    };
};
JSX.extend(KJUR.asn1.DERSequence, KJUR.asn1.DERAbstractStructured);

// ********************************************************************
/**
 * class for ASN.1 DER Set
 * @name KJUR.asn1.DERSet
 * @class class for ASN.1 DER Set
 * @extends KJUR.asn1.DERAbstractStructured
 * @description
 * <br/>
 * As for argument 'params' for constructor, you can specify one of
 * following properties:
 * <ul>
 * <li>array - specify array of ASN1Object to set elements of content</li>
 * </ul>
 * NOTE: 'params' can be omitted.
 */
KJUR.asn1.DERSet = function(params) {
    KJUR.asn1.DERSet.superclass.constructor.call(this, params);
    this.hT = "31";
    this.getFreshValueHex = function() {
	var a = new Array();
	for (var i = 0; i < this.asn1Array.length; i++) {
	    var asn1Obj = this.asn1Array[i];
	    a.push(asn1Obj.getEncodedHex());
	}
	a.sort();
	this.hV = a.join('');
	return this.hV;
    };
};
JSX.extend(KJUR.asn1.DERSet, KJUR.asn1.DERAbstractStructured);

// ********************************************************************
/**
 * class for ASN.1 DER TaggedObject
 * @name KJUR.asn1.DERTaggedObject
 * @class class for ASN.1 DER TaggedObject
 * @extends KJUR.asn1.ASN1Object
 * @description
 * <br/>
 * Parameter 'tagNoNex' is ASN.1 tag(T) value for this object.
 * For example, if you find '[1]' tag in a ASN.1 dump, 
 * 'tagNoHex' will be 'a1'.
 * <br/>
 * As for optional argument 'params' for constructor, you can specify *ANY* of
 * following properties:
 * <ul>
 * <li>explicit - specify true if this is explicit tag otherwise false 
 *     (default is 'true').</li>
 * <li>tag - specify tag (default is 'a0' which means [0])</li>
 * <li>obj - specify ASN1Object which is tagged</li>
 * </ul>
 * @example
 * d1 = new KJUR.asn1.DERUTF8String({'str':'a'});
 * d2 = new KJUR.asn1.DERTaggedObject({'obj': d1});
 * hex = d2.getEncodedHex();
 */
KJUR.asn1.DERTaggedObject = function(params) {
    KJUR.asn1.DERTaggedObject.superclass.constructor.call(this);
    this.hT = "a0";
    this.hV = '';
    this.isExplicit = true;
    this.asn1Object = null;

    /**
     * set value by an ASN1Object
     * @name setString
     * @memberOf KJUR.asn1.DERTaggedObject
     * @function
     * @param {Boolean} isExplicitFlag flag for explicit/implicit tag
     * @param {Integer} tagNoHex hexadecimal string of ASN.1 tag
     * @param {ASN1Object} asn1Object ASN.1 to encapsulate
     */
    this.setASN1Object = function(isExplicitFlag, tagNoHex, asn1Object) {
	this.hT = tagNoHex;
	this.isExplicit = isExplicitFlag;
	this.asn1Object = asn1Object;
	if (this.isExplicit) {
	    this.hV = this.asn1Object.getEncodedHex();
	    this.hTLV = null;
	    this.isModified = true;
	} else {
	    this.hV = null;
	    this.hTLV = asn1Object.getEncodedHex();
	    this.hTLV = this.hTLV.replace(/^../, tagNoHex);
	    this.isModified = false;
	}
    };

    this.getFreshValueHex = function() {
	return this.hV;
    };

    if (typeof params != "undefined") {
	if (typeof params['tag'] != "undefined") {
	    this.hT = params['tag'];
	}
	if (typeof params['explicit'] != "undefined") {
	    this.isExplicit = params['explicit'];
	}
	if (typeof params['obj'] != "undefined") {
	    this.asn1Object = params['obj'];
	    this.setASN1Object(this.isExplicit, this.hT, this.asn1Object);
	}
    }
};
JSX.extend(KJUR.asn1.DERTaggedObject, KJUR.asn1.ASN1Object);

var b64map="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var b64pad="=";

function hex2b64(h) {
  var i;
  var c;
  var ret = "";
  for(i = 0; i+3 <= h.length; i+=3) {
    c = parseInt(h.substring(i,i+3),16);
    ret += b64map.charAt(c >> 6) + b64map.charAt(c & 63);
  }
  if(i+1 == h.length) {
    c = parseInt(h.substring(i,i+1),16);
    ret += b64map.charAt(c << 2);
  }
  else if(i+2 == h.length) {
    c = parseInt(h.substring(i,i+2),16);
    ret += b64map.charAt(c >> 2) + b64map.charAt((c & 3) << 4);
  }
  while((ret.length & 3) > 0) ret += b64pad;
  return ret;
}

// convert a base64 string to hex
function b64tohex(s) {
  var ret = "";
  var i;
  var k = 0; // b64 state, 0-3
  var slop;
  for(i = 0; i < s.length; ++i) {
    if(s.charAt(i) == b64pad) break;
    let v = b64map.indexOf(s.charAt(i));
    if(v < 0) continue;
    if(k == 0) {
      ret += int2char(v >> 2);
      slop = v & 3;
      k = 1;
    }
    else if(k == 1) {
      ret += int2char((slop << 2) | (v >> 4));
      slop = v & 0xf;
      k = 2;
    }
    else if(k == 2) {
      ret += int2char(slop);
      ret += int2char(v >> 2);
      slop = v & 3;
      k = 3;
    }
    else {
      ret += int2char((slop << 2) | (v >> 4));
      ret += int2char(v & 0xf);
      k = 0;
    }
  }
  if(k == 1)
    ret += int2char(slop << 2);
  return ret;
}

/**
 * Retrieve the hexadecimal value (as a string) of the current ASN.1 element
 * @returns {string}
 * @public
 */
ASN1.prototype.getHexStringValue = function () {
  var hexString = this.toHexString();
  var offset = this.header * 2;
  var length = this.length * 2;
  return hexString.substr(offset, length);
};

/**
 * Method to parse a pem encoded string containing both a public or private key.
 * The method will translate the pem encoded string in a der encoded string and
 * will parse private key and public key parameters. This method accepts public key
 * in the rsaencryption pkcs #1 format (oid: 1.2.840.113549.1.1.1).
 *
 * @todo Check how many rsa formats use the same format of pkcs #1.
 *
 * The format is defined as:
 * PublicKeyInfo ::= SEQUENCE {
 *   algorithm       AlgorithmIdentifier,
 *   PublicKey       BIT STRING
 * }
 * Where AlgorithmIdentifier is:
 * AlgorithmIdentifier ::= SEQUENCE {
 *   algorithm       OBJECT IDENTIFIER,     the OID of the enc algorithm
 *   parameters      ANY DEFINED BY algorithm OPTIONAL (NULL for PKCS #1)
 * }
 * and PublicKey is a SEQUENCE encapsulated in a BIT STRING
 * RSAPublicKey ::= SEQUENCE {
 *   modulus           INTEGER,  -- n
 *   publicExponent    INTEGER   -- e
 * }
 * it's possible to examine the structure of the keys obtained from openssl using
 * an asn.1 dumper as the one used here to parse the components: http://lapo.it/asn1js/
 * @argument {string} pem the pem encoded string, can include the BEGIN/END header/footer
 * @private
 */
RSAKey.prototype.parseKey = function (pem) {
  try {
    var modulus = 0;
    var public_exponent = 0;
    var reHex = /^\s*(?:[0-9A-Fa-f][0-9A-Fa-f]\s*)+$/;
    var der = reHex.test(pem) ? Hex.decode(pem) : Base64.unarmor(pem);
    var asn1 = ASN1.decode(der);

    //Fixes a bug with OpenSSL 1.0+ private keys
    if(asn1.sub.length === 3){
        asn1 = asn1.sub[2].sub[0];
    }
    if (asn1.sub.length === 9) {

      // Parse the private key.
      modulus = asn1.sub[1].getHexStringValue(); //bigint
      this.n = parseBigInt(modulus, 16);

      public_exponent = asn1.sub[2].getHexStringValue(); //int
      this.e = parseInt(public_exponent, 16);

      var private_exponent = asn1.sub[3].getHexStringValue(); //bigint
      this.d = parseBigInt(private_exponent, 16);

      var prime1 = asn1.sub[4].getHexStringValue(); //bigint
      this.p = parseBigInt(prime1, 16);

      var prime2 = asn1.sub[5].getHexStringValue(); //bigint
      this.q = parseBigInt(prime2, 16);

      var exponent1 = asn1.sub[6].getHexStringValue(); //bigint
      this.dmp1 = parseBigInt(exponent1, 16);

      var exponent2 = asn1.sub[7].getHexStringValue(); //bigint
      this.dmq1 = parseBigInt(exponent2, 16);

      var coefficient = asn1.sub[8].getHexStringValue(); //bigint
      this.coeff = parseBigInt(coefficient, 16);

    }
    else if (asn1.sub.length === 2) {

      // Parse the public key.
      var bit_string = asn1.sub[1];
      var sequence = bit_string.sub[0];

      modulus = sequence.sub[0].getHexStringValue();
      this.n = parseBigInt(modulus, 16);
      public_exponent = sequence.sub[1].getHexStringValue();
      this.e = parseInt(public_exponent, 16);

    }
    else {
      return false;
    }
    return true;
  }
  catch (ex) {
    return false;
  }
};

/**
 * Translate rsa parameters in a hex encoded string representing the rsa key.
 *
 * The translation follow the ASN.1 notation :
 * RSAPrivateKey ::= SEQUENCE {
 *   version           Version,
 *   modulus           INTEGER,  -- n
 *   publicExponent    INTEGER,  -- e
 *   privateExponent   INTEGER,  -- d
 *   prime1            INTEGER,  -- p
 *   prime2            INTEGER,  -- q
 *   exponent1         INTEGER,  -- d mod (p1)
 *   exponent2         INTEGER,  -- d mod (q-1)
 *   coefficient       INTEGER,  -- (inverse of q) mod p
 * }
 * @returns {string}  DER Encoded String representing the rsa private key
 * @private
 */
RSAKey.prototype.getPrivateBaseKey = function () {
  var options = {
    'array': [
      new KJUR.asn1.DERInteger({'int': 0}),
      new KJUR.asn1.DERInteger({'bigint': this.n}),
      new KJUR.asn1.DERInteger({'int': this.e}),
      new KJUR.asn1.DERInteger({'bigint': this.d}),
      new KJUR.asn1.DERInteger({'bigint': this.p}),
      new KJUR.asn1.DERInteger({'bigint': this.q}),
      new KJUR.asn1.DERInteger({'bigint': this.dmp1}),
      new KJUR.asn1.DERInteger({'bigint': this.dmq1}),
      new KJUR.asn1.DERInteger({'bigint': this.coeff})
    ]
  };
  var seq = new KJUR.asn1.DERSequence(options);
  return seq.getEncodedHex();
};

/**
 * base64 (pem) encoded version of the DER encoded representation
 * @returns {string} pem encoded representation without header and footer
 * @public
 */
RSAKey.prototype.getPrivateBaseKeyB64 = function () {
  return hex2b64(this.getPrivateBaseKey());
};

/**
 * Translate rsa parameters in a hex encoded string representing the rsa public key.
 * The representation follow the ASN.1 notation :
 * PublicKeyInfo ::= SEQUENCE {
 *   algorithm       AlgorithmIdentifier,
 *   PublicKey       BIT STRING
 * }
 * Where AlgorithmIdentifier is:
 * AlgorithmIdentifier ::= SEQUENCE {
 *   algorithm       OBJECT IDENTIFIER,     the OID of the enc algorithm
 *   parameters      ANY DEFINED BY algorithm OPTIONAL (NULL for PKCS #1)
 * }
 * and PublicKey is a SEQUENCE encapsulated in a BIT STRING
 * RSAPublicKey ::= SEQUENCE {
 *   modulus           INTEGER,  -- n
 *   publicExponent    INTEGER   -- e
 * }
 * @returns {string} DER Encoded String representing the rsa public key
 * @private
 */
RSAKey.prototype.getPublicBaseKey = function () {
  var options = {
    'array': [
      new KJUR.asn1.DERObjectIdentifier({'oid': '1.2.840.113549.1.1.1'}), //RSA Encryption pkcs #1 oid
      new KJUR.asn1.DERNull()
    ]
  };
  var first_sequence = new KJUR.asn1.DERSequence(options);

  options = {
    'array': [
      new KJUR.asn1.DERInteger({'bigint': this.n}),
      new KJUR.asn1.DERInteger({'int': this.e})
    ]
  };
  var second_sequence = new KJUR.asn1.DERSequence(options);

  options = {
    'hex': '00' + second_sequence.getEncodedHex()
  };
  var bit_string = new KJUR.asn1.DERBitString(options);

  options = {
    'array': [
      first_sequence,
      bit_string
    ]
  };
  var seq = new KJUR.asn1.DERSequence(options);
  return seq.getEncodedHex();
};

/**
 * base64 (pem) encoded version of the DER encoded representation
 * @returns {string} pem encoded representation without header and footer
 * @public
 */
RSAKey.prototype.getPublicBaseKeyB64 = function () {
  return hex2b64(this.getPublicBaseKey());
};

/**
 * wrap the string in block of width chars. The default value for rsa keys is 64
 * characters.
 * @param {string} str the pem encoded string without header and footer
 * @param {Number} [width=64] - the length the string has to be wrapped at
 * @returns {string}
 * @private
 */
RSAKey.prototype.wordwrap = function (str, width) {
  width = width || 64;
  if (!str) {
    return str;
  }
  var regex = '(.{1,' + width + '})( +|$\n?)|(.{1,' + width + '})';
  return str.match(RegExp(regex, 'g')).join('\n');
};

/**
 * Retrieve the pem encoded private key
 * @returns {string} the pem encoded private key with header/footer
 * @public
 */
RSAKey.prototype.getPrivateKey = function () {
  var key = "-----BEGIN RSA PRIVATE KEY-----\n";
  key += this.wordwrap(this.getPrivateBaseKeyB64()) + "\n";
  key += "-----END RSA PRIVATE KEY-----";
  return key;
};

/**
 * Retrieve the pem encoded public key
 * @returns {string} the pem encoded public key with header/footer
 * @public
 */
RSAKey.prototype.getPublicKey = function () {
  var key = "-----BEGIN PUBLIC KEY-----\n";
  key += this.wordwrap(this.getPublicBaseKeyB64()) + "\n";
  key += "-----END PUBLIC KEY-----";
  return key;
};

/**
 * Check if the object contains the necessary parameters to populate the rsa modulus
 * and public exponent parameters.
 * @param {Object} [obj={}] - An object that may contain the two public key
 * parameters
 * @returns {boolean} true if the object contains both the modulus and the public exponent
 * properties (n and e)
 * @todo check for types of n and e. N should be a parseable bigInt object, E should
 * be a parseable integer number
 * @private
 */
RSAKey.prototype.hasPublicKeyProperty = function (obj) {
  obj = obj || {};
  return (
    obj.hasOwnProperty('n') &&
    obj.hasOwnProperty('e')
  );
};

/**
 * Check if the object contains ALL the parameters of an RSA key.
 * @param {Object} [obj={}] - An object that may contain nine rsa key
 * parameters
 * @returns {boolean} true if the object contains all the parameters needed
 * @todo check for types of the parameters all the parameters but the public exponent
 * should be parseable bigint objects, the public exponent should be a parseable integer number
 * @private
 */
RSAKey.prototype.hasPrivateKeyProperty = function (obj) {
  obj = obj || {};
  return (
    obj.hasOwnProperty('n') &&
    obj.hasOwnProperty('e') &&
    obj.hasOwnProperty('d') &&
    obj.hasOwnProperty('p') &&
    obj.hasOwnProperty('q') &&
    obj.hasOwnProperty('dmp1') &&
    obj.hasOwnProperty('dmq1') &&
    obj.hasOwnProperty('coeff')
  );
};

/**
 * Parse the properties of obj in the current rsa object. Obj should AT LEAST
 * include the modulus and public exponent (n, e) parameters.
 * @param {Object} obj - the object containing rsa parameters
 * @private
 */
RSAKey.prototype.parsePropertiesFrom = function (obj) {
  this.n = obj.n;
  this.e = obj.e;

  if (obj.hasOwnProperty('d')) {
    this.d = obj.d;
    this.p = obj.p;
    this.q = obj.q;
    this.dmp1 = obj.dmp1;
    this.dmq1 = obj.dmq1;
    this.coeff = obj.coeff;
  }
};

/**
 * Create a new JSEncryptRSAKey that extends Tom Wu's RSA key object.
 * This object is just a decorator for parsing the key parameter
 * @param {string|Object} key - The key in string format, or an object containing
 * the parameters needed to build a RSAKey object.
 * @constructor
 */
class JSEncryptRSAKey extends RSAKey {
  constructor(key) {
    // Call the super constructor.
    super();
    // If a key key was provided.
    if (key) {
      // If this is a string...
      if (typeof key === 'string') {
        this.parseKey(key);
      }
      else if (
          this.hasPrivateKeyProperty(key) ||
          this.hasPublicKeyProperty(key)
      ) {
        // Set the values for the key.
        this.parsePropertiesFrom(key);
      }
    }
  }
}

/**
 *
 * @param {Object} [options = {}] - An object to customize JSEncrypt behaviour
 * possible parameters are:
 * - default_key_size        {number}  default: 1024 the key size in bit
 * - default_public_exponent {string}  default: '010001' the hexadecimal representation of the public exponent
 * - log                     {boolean} default: false whether log warn/error or not
 * @constructor
 */
class JSEncrypt{
  constructor (options) {
    options = options || {};
    this.default_key_size = parseInt(options.default_key_size) || 1024;
    this.default_public_exponent = options.default_public_exponent || '010001'; //65537 default openssl public exponent for rsa key type
    this.log = options.log || false;
    // The private and public key.
    this.key = null;
  }
}

/**
 * Method to set the rsa key parameter (one method is enough to set both the public
 * and the private key, since the private key contains the public key paramenters)
 * Log a warning if logs are enabled
 * @param {Object|string} key the pem encoded string or an object (with or without header/footer)
 * @public
 */
JSEncrypt.prototype.setKey = function (key) {
  if (this.log && this.key) {
    console.warn('A key was already set, overriding existing.');
  }
  this.key = new JSEncryptRSAKey(key);
};

/**
 * Proxy method for setKey, for api compatibility
 * @see setKey
 * @public
 */
JSEncrypt.prototype.setPrivateKey = function (privkey) {
  // Create the key.
  this.setKey(privkey);
};

/**
 * Proxy method for setKey, for api compatibility
 * @see setKey
 * @public
 */
JSEncrypt.prototype.setPublicKey = function (pubkey) {
  // Sets the public key.
  this.setKey(pubkey);
};

/**
 * Proxy method for RSAKey object's decrypt, decrypt the string using the private
 * components of the rsa key object. Note that if the object was not set will be created
 * on the fly (by the getKey method) using the parameters passed in the JSEncrypt constructor
 * @param {string} string base64 encoded crypted string to decrypt
 * @return {string} the decrypted string
 * @public
 */
JSEncrypt.prototype.decrypt = function (string) {
  // Return the decrypted string.
  try {
    return this.getKey().decrypt(b64tohex(string));
  }
  catch (ex) {
    return false;
  }
};

/**
 * Proxy method for RSAKey object's encrypt, encrypt the string using the public
 * components of the rsa key object. Note that if the object was not set will be created
 * on the fly (by the getKey method) using the parameters passed in the JSEncrypt constructor
 * @param {string} string the string to encrypt
 * @return {string} the encrypted string encoded in base64
 * @public
 */
JSEncrypt.prototype.encrypt = function (string) {
  // Return the encrypted string.
  try {
    return hex2b64(this.getKey().encrypt(string));
  }
  catch (ex) {
    return false;
  }
};

/**
 * Getter for the current JSEncryptRSAKey object. If it doesn't exists a new object
 * will be created and returned
 * @param {callback} [cb] the callback to be called if we want the key to be generated
 * in an async fashion
 * @returns {JSEncryptRSAKey} the JSEncryptRSAKey object
 * @public
 */
JSEncrypt.prototype.getKey = function (cb) {
  // Only create new if it does not exist.
  if (!this.key) {
    // Get a new private key.
    this.key = new JSEncryptRSAKey();
    if (cb && {}.toString.call(cb) === '[object Function]') {
      this.key.generateAsync(this.default_key_size, this.default_public_exponent, cb);
      return;
    }
    // Generate the key.
    this.key.generate(this.default_key_size, this.default_public_exponent);
  }
  return this.key;
};

/**
 * Returns the pem encoded representation of the private key
 * If the key doesn't exists a new key will be created
 * @returns {string} pem encoded representation of the private key WITH header and footer
 * @public
 */
JSEncrypt.prototype.getPrivateKey = function () {
  // Return the private representation of this key.
  return this.getKey().getPrivateKey();
};

/**
 * Returns the pem encoded representation of the private key
 * If the key doesn't exists a new key will be created
 * @returns {string} pem encoded representation of the private key WITHOUT header and footer
 * @public
 */
JSEncrypt.prototype.getPrivateKeyB64 = function () {
  // Return the private representation of this key.
  return this.getKey().getPrivateBaseKeyB64();
};


/**
 * Returns the pem encoded representation of the public key
 * If the key doesn't exists a new key will be created
 * @returns {string} pem encoded representation of the public key WITH header and footer
 * @public
 */
JSEncrypt.prototype.getPublicKey = function () {
  // Return the private representation of this key.
  return this.getKey().getPublicKey();
};

/**
 * Returns the pem encoded representation of the public key
 * If the key doesn't exists a new key will be created
 * @returns {string} pem encoded representation of the public key WITHOUT header and footer
 * @public
 */
JSEncrypt.prototype.getPublicKeyB64 = function () {
  // Return the private representation of this key.
  return this.getKey().getPublicBaseKeyB64();
};

class BaseTransport {
    constructor(endpoint, stream_type, config={}) {
        this.stream_type = stream_type;
        this.endpoint = endpoint;
        this.eventSource = new EventEmitter();
        this.dataQueue = [];
    }

    static canTransfer(stream_type) {
        return BaseTransport.streamTypes().includes(stream_type);
    }
    
    static streamTypes() {
        return [];
    }

    destroy() {
        this.eventSource.destroy();
    }

    connect() {
        // TO be impemented
    }

    disconnect() {
        // TO be impemented
    }

    reconnect() {
        return this.disconnect().then(()=>{
            return this.connect();
        });
    }

    setEndpoint(endpoint) {
        this.endpoint = endpoint;
        return this.reconnect();
    }

    send(data) {
        // TO be impemented
        // return this.prepare(data).send();
    }

    prepare(data) {
        // TO be impemented
        // return new Request(data);
    }

    // onData(type, data) {
    //     this.eventSource.dispatchEvent(type, data);
    // }
}

function SMediaError(data) {
    if(data instanceof SMediaError) {
        return data;
    }

    if (typeof data === 'number') {
        this.code = data;
    } else if (typeof value === 'string') {
        this.message = data;
    }

    if (!this.message) {
        this.message = SMediaError.defaultMessages[this.code] || '';
    }
}

SMediaError.prototype.code = 0;
SMediaError.prototype.message = '';

SMediaError.errorTypes = [
    'MEDIA_ERR_CUSTOM',
    'MEDIA_ERR_ABORTED',
    'MEDIA_ERR_NETWORK',
    'MEDIA_ERR_DECODE',
    'MEDIA_ERR_SRC_NOT_SUPPORTED',
    'MEDIA_ERR_ENCRYPTED',
    'MEDIA_ERR_TRANSPORT'
];

SMediaError.defaultMessages = {
    1: 'The fetching of the associated resource was aborted by the user\'s request.',
    2: 'Some kind of network error occurred which prevented the media from being successfully fetched, despite having previously been available.',
    3: 'Despite having previously been determined to be usable, an error occurred while trying to decode the media resource, resulting in an error.',
    4: 'The associated resource or media provider object (such as a MediaStream) has been found to be unsuitable.',
    5: 'The media is encrypted and we do not have the keys to decrypt it.',
    6: 'Transport error'
};

for (let errIndex = 0; errIndex < SMediaError.errorTypes.length; errIndex++) {
    SMediaError[SMediaError.errorTypes[errIndex]] = errIndex;
    SMediaError.prototype[SMediaError.errorTypes[errIndex]] = errIndex;
}

const LOG_TAG = "transport:ws";
const Log$1 = getTagged(LOG_TAG);
const LogI = getTagged("info");

class WebsocketTransport extends BaseTransport {
    constructor(endpoint, stream_type, options={
        socket:`${location.protocol.replace('http', 'ws')}//${location.host}/ws/`,
        workers: 1
    }) {
        super(endpoint, stream_type);
        this.proxies = [];
        this.currentProxy = 0;
        this.workers = 1;
        this.socket_url = options.socket;
        this.ready = this.connect();
    }

    destroy() {
        return this.disconnect().then(()=>{
            return super.destroy();
        });

    }

    static canTransfer(stream_type) {
        return WebsocketTransport.streamTypes().includes(stream_type);
    }

    static streamTypes() {
        return ['hls', 'rtsp'];
    }

    connect() {
        return this.disconnect().then(()=>{
            let promises = [];
            // TODO: get mirror list
            for (let i=0; i<this.workers; ++i) {
                let proxy = new WebSocketProxy(this.socket_url, this.endpoint, this.stream_type);

                proxy.set_info_handler((info)=>{
                    this.eventSource.dispatchEvent('info', info);
                });

                proxy.set_error_handler((error)=>{
                    this.eventSource.dispatchEvent('error', error);
                });
                proxy.set_disconnect_handler((error)=> {
                    this.eventSource.dispatchEvent('disconnected', {code: error.code, reason: error.reason});
                    // TODO: only reconnect on demand
                    if ([1000, 1006, 1013, 1011].includes(error.code)) {
                        setTimeout(()=> {
                            if (this.ready && this.ready.reject) {
                                this.ready.reject();
                            }
                            this.ready = this.connect();
                        }, 3000);
                    }
                });

                proxy.set_data_handler((data)=> {
                    this.dataQueue.push(new Uint8Array(data));
                    this.eventSource.dispatchEvent('data');
                });

                promises.push(proxy.connect().then(()=> {
                    this.eventSource.dispatchEvent('connected');
                }).catch((e)=> {
                    this.eventSource.dispatchEvent('error');
                    throw new Error(e);
                }));
                this.proxies.push(proxy);
            }
            return Promise.all(promises);
        });
    }

    disconnect() {
        let promises = [];
        for (let i=0; i<this.proxies.length; ++i) {
            promises.push(this.proxies[i].close());
        }
        this.proxies= [];
        if (this.proxies.length) {
            return Promise.all(promises);
        } else {
            return Promise.resolve();
        }
    }

    socket() {
        return this.proxies[(this.currentProxy++)%this.proxies.length];
    }

    send(_data, fn) {
        let res = this.socket().send(_data);
        if (fn) {
            fn(res.seq);
        }
        return res.promise;
    }
}

class WSPProtocol {
    static get PROTO() {return  'WSP';}

    static get V1_1() {return '1.1';}

    static get CMD_INIT() {return 'INIT';}
    static get CMD_JOIN() {return  'JOIN';}
    static get CMD_WRAP() {return  'WRAP';}
    static get CMD_GET_INFO() {return 'GET_INFO';}

    // custom close codes
    static get WCC_INVALID_DOMAIN() {return 4000;}

    constructor(ver){
        this.ver = ver;
    }

    build(cmd, data, payload=''){
        let data_str='';
        if (!data.seq) {
            data.seq = ++WSPProtocol.seq;
        }
        for (let k in data) {
            data_str += `${k}: ${data[k]}\r\n`;
        }
        return `${WSPProtocol.PROTO}/${this.ver} ${cmd}\r\n${data_str}\r\n${payload}`;
    }

    static parse(data) {
        let payIdx = data.indexOf('\r\n\r\n');
        let lines = data.substr(0, payIdx).split('\r\n');
        let hdr = lines.shift().match(new RegExp(`${WSPProtocol.PROTO}/${WSPProtocol.V1_1}\\s+(\\d+)\\s+(.+)`));
        if (hdr) {
            let res = {
                code: Number(hdr[1]),
                msg:  hdr[2],
                data: {},
                payload: ''
            };
            while (lines.length) {
                let line = lines.shift();
                if (line) {
                    let [k,v] = line.split(':');
                    res.data[k.trim()] = v.trim();
                } else {
                    break;
                }
            }
            res.payload = data.substr(payIdx+4);
            return res;
        }
        return null;
    }
}
WSPProtocol.seq = 0;

class WebSocketProxy {
    static get CHN_CONTROL() {return 'control';}
    static get CHN_DATA() {return  'data';}

    constructor(wsurl, endpoint, stream_type) {
        this.url = wsurl;
        this.stream_type = stream_type;
        this.endpoint = endpoint;
        this.data_handler = ()=>{};
        this.error_handler = ()=>{};
        this.disconnect_handler = ()=>{};
        this.builder = new WSPProtocol(WSPProtocol.V1_1);
        this.awaitingPromises = {};
        this.seq = 0;
        this.encryptor = new JSEncrypt();
        this.info_handler = ()=>{};
    }

    set_error_handler(handler){
        this.error_handler = handler;
    }

    set_data_handler(handler) {
        this.data_handler = handler;
    }

    set_disconnect_handler(handler) {
        this.disconnect_handler = handler;
    }

    set_info_handler(handler){
        this.info_handler = handler;
    }

    close() {
        Log$1.log('closing connection');
        return new Promise((resolve)=>{
            this.ctrlChannel.onclose = ()=>{
                if (this.dataChannel) {
                    this.dataChannel.onclose = ()=>{
                        Log$1.log('closed');
                        resolve();
                    };
                    this.dataChannel.close();
                } else {
                    Log$1.log('closed');
                    resolve();
                }
            };
            this.ctrlChannel.close();
        });
    }

    onDisconnect(error){
        this.ctrlChannel.onclose=null;
        this.ctrlChannel.close();
        if (this.dataChannel) {
            this.dataChannel.onclose = null;
            this.dataChannel.close();
        }
        this.disconnect_handler(error);
        if(error.code === WSPProtocol.WCC_INVALID_DOMAIN){
            let err = new SMediaError(SMediaError.MEDIA_ERR_TRANSPORT);
            err.message = "Invalid Domain (credentials)";
            Log$1.error("Invalid domain (credentials)");
            this.error(err);
        }
    }

    initDataChannel(channel_id) {
        return new Promise((resolve, reject)=>{
            this.dataChannel = new WebSocket(this.url, WebSocketProxy.CHN_DATA);
            this.dataChannel.binaryType = 'arraybuffer';
            this.dataChannel.onopen = ()=>{
                let msg = this.builder.build(WSPProtocol.CMD_JOIN, {
                    channel: channel_id
                });
                Log$1.debug(msg);
                this.dataChannel.send(msg);
            };
            this.dataChannel.onmessage = (ev)=>{
                Log$1.debug(`[data]\r\n${ev.data}`);
                let res = WSPProtocol.parse(ev.data);
                if (!res) {
                    return reject();
                }

                this.dataChannel.onmessage=(e)=>{
                    // Log.debug('got data');
                    if (this.data_handler) {
                        this.data_handler(e.data);
                    }
                };
                resolve();
            };
            this.dataChannel.onerror = (e)=>{
                this.dataChannel.close();
                this.error(SMediaError.MEDIA_ERR_TRANSPORT);
            };
            this.dataChannel.onclose = (e)=>{
                Log$1.error(`[data] ${e.type}. code: ${e.code}, reason: ${e.reason || 'unknown reason'}`);
                this.onDisconnect(e);
            };
        });
    }

    error(err){
        if (err !== undefined) {
            this.error_ = new SMediaError(err);
            if (this.error_handler){
                this.error_handler(this.error_ );
            }
        }
        return this.error_;
    }

    onProxyCommandResponse(res){
        LogI.setLevel(4);

        let command = res.data.command;
        let jsonObj = JSON.parse(res.payload);

        if (command === WSPProtocol.CMD_GET_INFO && jsonObj && jsonObj.info)
        {
            LogI.log("------------- Info ---------------------");

            let infoObj = jsonObj.info;
            let licenseInfo     = infoObj.license;
            let expiresAt       = licenseInfo.expiresAt;
            let requestedDomain = infoObj.requestedDomain;
            let clients = infoObj.clients;

            LogI.log("License expires at : ", expiresAt);
            LogI.log("Requested domain   : ", requestedDomain);

            if (clients) {
                LogI.log("------------- Source list --------------");
                for (let client in clients) {
                    LogI.log("Client: ", client);
                    if(clients[client]) {
                        clients[client].forEach((src) => {
                            LogI.log(" ", src.description, ":", src.url);
                        });
                    } else {
                        LogI.log(" Client sources not found");
                    }
                }
                this.info_handler(infoObj);
            }

            LogI.log("-----------------------------------------");
        }
    }

    connect() {
        this.encryptionKey = null;
        return new Promise((resolve, reject)=>{
            this.ctrlChannel = new WebSocket(this.url, WebSocketProxy.CHN_CONTROL);

            this.connected = false;

            this.ctrlChannel.onopen = ()=>{
                let headers = {
                    proto: this.stream_type
                };
                if (this.endpoint.socket) {
                    headers.socket = this.endpoint.socket;
                } else {
                    Object.assign(headers, {
                        host:  this.endpoint.host,
                        port:  this.endpoint.port,
                        client: this.endpoint.client
                    });
                }
                 let msgLicense = this.builder.build(WSPProtocol.CMD_GET_INFO, headers);
                 Log$1.debug(msgLicense);
                 this.ctrlChannel.send(msgLicense);

                 let msg = this.builder.build(WSPProtocol.CMD_INIT, headers);
                 Log$1.debug(msg);
                 this.ctrlChannel.send(msg);
            };

            this.ctrlChannel.onmessage = (ev)=>{
                Log$1.debug(`[ctrl]\r\n${ev.data}`);

                let res = WSPProtocol.parse(ev.data);
                if (!res) {
                    return reject();
                }
                if (res.data && res.data.command && res.data.type && res.payload){
                    this.onProxyCommandResponse(res);
                    return;
                }

                if (res.code >= 300) {
                    Log$1.error(`[ctrl]\r\n${res.code}: ${res.msg}`);
                    return reject();
                }
                this.ctrlChannel.onmessage = (e)=> {
                    let res = WSPProtocol.parse(e.data);
                    Log$1.debug(`[ctrl]\r\n${e.data}`);
                    if (res.data.seq in this.awaitingPromises) {
                        if (res.code < 300) {
                            this.awaitingPromises[res.data.seq].resolve(res);
                        } else {
                            this.awaitingPromises[res.data.seq].reject(res);
                        }
                        delete this.awaitingPromises[res.data.seq];
                    }
                };
                this.encryptionKey = res.data.pubkey || null;
                if (this.encryptionKey) {
                    this.encryptor.setPublicKey(this.encryptionKey);
                    // TODO: check errors
                }
                this.initDataChannel(res.data.channel).then(resolve).catch(reject);
            };

            this.ctrlChannel.onerror = (e)=>{
                Log$1.error(`[ctrl] ${e.type}`);
                this.error(SMediaError.MEDIA_ERR_TRANSPORT);
                this.ctrlChannel.close();
            };
            this.ctrlChannel.onclose = (e)=>{
                Log$1.error(`[ctrl] ${e.type}. code: ${e.code} ${e.reason || 'unknown reason'}`);
                this.onDisconnect(e);
            };
        });
    }

    encrypt(msg) {
        if (this.encryptionKey) {
            let crypted = this.encryptor.encrypt(msg);
            if (crypted === false) {
                this.error(SMediaError.MEDIA_ERR_ENCRYPTED);
                return;
            }
            return crypted;
        }
        return msg;
    }

    send(payload) {
        if (this.ctrlChannel.readyState != WebSocket.OPEN) {
            this.close();
            this.error(SMediaError.MEDIA_ERR_TRANSPORT);
            return;
        }
        // Log.debug(payload);
        let data = {
            contentLength: payload.length,
            seq: ++WSPProtocol.seq
        };
        return {
            seq:data.seq,
            promise: new Promise((resolve, reject)=>{
                this.awaitingPromises[data.seq] = {resolve, reject};
                let msg = this.builder.build(WSPProtocol.CMD_WRAP, data, payload);
                Log$1.debug(msg);
                this.ctrlChannel.send(this.encrypt(msg));
            })};
    }
}

class MediaRecorder {
    constructor(parent, prefix) {
        this.parent = parent;
        this.prefix = prefix;
        this.remuxer;
        this.header;
        this.firstBuffer = new Uint8Array(0);
        this.secondBuffer = new Uint8Array(0);
        this.byteBuffer = this.firstBuffer;
        this.isSwaped = false;
        this.isPaused = false;
        this.isRecording = false;

        this.fileLength = 180000; /*download every 3 minutes*/
    }

    setFileLength(milliseconds) {
        if (milliseconds) {
            this.fileLength = milliseconds;
        }
    }

    init(event) {
        let tracks = event.detail;
        let tracks_list = [];
        for (let key in tracks) {
            let type = tracks[key].mp4track.type;
            if (type === "video" || type === "audio") {
                tracks_list.push(tracks[key].mp4track);
            }
        }

        this.header = MP4.initSegment(tracks_list, tracks[1].duration*tracks[1].timescale, tracks[1].timescale);
    }

    pushData(event) {
        if (this.isRecording) {
            if (this.byteBuffer.length == 0) {
                this.setBuffer(this.header);
            }

            this.setBuffer(event.detail[0]);
            this.setBuffer(event.detail[1]);
        }
    }

    record(recordvalue) {
        if (recordvalue) {
            if (!this.isRecording) {
                this.flushInterval = setInterval(this.flush.bind(this), this.fileLength);
            }
        } else {
            clearInterval(this.flushInterval);
            this.flush();
        }

        this.isRecording = recordvalue;
    }

    pause(value) {
        if (this.isRecording || this.isPaused) { 
            this.record(!value);
            this.isPaused = value;
        }
    }

    setBuffer(data) {
        if (this.isRecording) {
            let tmp = new Uint8Array(this.byteBuffer.byteLength + data.byteLength);
            tmp.set(new Uint8Array(this.byteBuffer), 0);
            tmp.set(new Uint8Array(data), this.byteBuffer.byteLength);
            this.byteBuffer = tmp;
        }
    }

    swapBuffer() {
        this.isSwaped = !this.isSwaped;

        if (this.isSwaped) {
            this.byteBuffer = this.secondBuffer;
            this.firstBuffer = new Uint8Array(0);
        } else {
            this.byteBuffer = this.firstBuffer;
            this.secondBuffer = new Uint8Array(0);
        }
    }

    flush() {
        let byteBuffer = this.byteBuffer;
        this.swapBuffer();
        if (this.header && byteBuffer.length > this.header.length) {
            this.parent.mediadata(byteBuffer, this.prefix);
        }
    }

    attachSource(remuxer) {
        this.remuxer = remuxer;
        this.remuxer.eventSource.addEventListener('mp4initsegement', this.init.bind(this));
        this.remuxer.eventSource.addEventListener('mp4payload', this.pushData.bind(this));
    }

    dettachSource() {
        if (this.remuxer) {
            this.remuxer.eventSource.removeEventListener('mp4initsegement');
            this.remuxer.eventSource.removeEventListener('mp4payload');
            this.remuxer = null;
        }
    }

    destroy() {
        this.record(false);
        this.dettachSource();
    }
}

const Log = getTagged('wsp');

class StreamType {
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

class WSPlayer {

    constructor(node, opts) {
        if (typeof node == typeof '') {
            this.player = document.getElementById(node);
        } else {
            this.player = node;
        }

        let modules = opts.modules || {
            client: RTSPClient,
            transport: {
                constructor: WebsocketTransport
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
            let transport = module.transport || WebsocketTransport;
            let client = module.client || RTSPClient;
            if (transport.constructor.canTransfer(client.streamType())) {
                this.modules[client.streamType()] = {
                    client: client,
                    transport: transport
                };
            } else {
                Log.warn(`Client stream type ${client.streamType()} is incompatible with transport types [${transport.streamTypes().join(', ')}]. Skip`);
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
            let transport = module.transport || WebsocketTransport;
            let client = module.client || RTSPClient;
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
            this.info(infoEvent.detail);
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

setDefaultLogLevel(LogLevel.Error);
getTagged("transport:ws").setLevel(LogLevel.Error);
getTagged("client:rtsp").setLevel(LogLevel.Debug);
getTagged("mse").setLevel(LogLevel.Debug);

window.Streamedian = {
    logger(tag) {
        return getTagged(tag)
    },
    player(node, opts) {
        if (!opts.socket) {
            throw new Error("socket parameter is not set");
        }

        let _options = {
            modules: [
                {
                    client: RTSPClient,
                    transport: {
                        constructor: WebsocketTransport,
                        options: {
                            socket: opts.socket
                        }
                    }
                }
            ],
            errorHandler(e) {
                if(opts.errorHandler) {
                    opts.errorHandler(e);
                } else {
                    alert(`Failed to start player: ${e.message}`);
                }
            },
            infoHandler(inf) {
                if(opts.infoHandler) {
                    opts.infoHandler(inf);
                }
            },
            dataHandler(data, prefix) {
                if(opts.dataHandler) {
                    opts.dataHandler(data, prefix);
                }
            },
            redirectNativeMediaErrors: opts.redirectNativeMediaErrors,
            bufferDuration : opts.bufferDuration,
            continuousFileLength: opts.continuousFileLength,
            eventFileLength: opts.eventFileLength,

            queryCredentials(client) {
                return new Promise((resolve, reject) => {
                    let c = prompt('input credentials in format user:password');
                    if (c) {
                        client.setCredentials.apply(client, c.split(':'));
                        resolve();
                    } else {
                        reject();
                    }
                });
            }
        };
        return new WSPlayer(node, _options);
    }
};
