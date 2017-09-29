exports.thread = class {
    constructor(api, threadID) {
        this.api = api;
        this._threadID = threadID;
    }

    get threadID() {
        return this._threadID;
    }
}