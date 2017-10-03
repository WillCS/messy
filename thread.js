exports.thread = class {
    constructor(api, thread, threadID) {
        this.api = api;
        this._threadID = threadID;
        this._emoji = thread.emoji.emoji;
    }

    get threadID() {
        return this._threadID;
    }

    set emoji(emoji) {
        this._emoji = emoji;
    }

    get emoji() {
        return this._emoji;
    }
}