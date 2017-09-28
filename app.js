const fs = require("fs");
const chatAPI = require("facebook-chat-api");

exports.app = class {
    constructor() {
        this.data = {threads: {}, senders: {}};
        this.aliases = {};

        this.login()
            .then((api) => {
                this.api = api;
                this.userID = this.api.getCurrentUserID();

                fs.writeFileSync("appstate.json", JSON.stringify(api.getAppState()));
                if(fs.existsSync(("aliases.json"))) {
                    let list = JSON.parse(fs.readFileSync("aliases.json", "utf8"));
                    if(this.userID in list) {
                        this.aliases = list[this.userID];
                    }
                }

                this.setupVorpal();

                this.api.listen((err, event) => {
                    if(!err) {
                        switch(event.type) {
                            case "message":
                                this.readMessage(event);
                                break;
                        }
                    } else {
                        this.vorpal.log(err);
                    }
                });
            }).catch((err) => {
                console.error(err);
            });
    }

    login() {
        return new Promise((resolve, reject) => {
            let _login = (credentials) => {
                let options = {
                    logLevel: "silent",
                    forceLogin: true
                };
        
                chatAPI(credentials, options, (err, api) => {
                    if(err) {
                        switch(err.error) {
                            case "login-approval":
                                break;
                            default:
                                reject(err);
                        }
                    } else {
                        resolve(api);
                    }
                });
            };

            if(fs.existsSync("appstate.json")) {
                _login({
                    appState: JSON.parse(fs.readFileSync("appstate.json", "utf8"))
                });
            } else {
                prompt = require("prompt");
                prompt.colors = false;
                prompt.message = "";
                prompt.start();
                prompt.get({
                    properties: {
                        email: {
                            required: true,
                            message: "Email"
                        },
                        password: {
                            required: true,
                            hidden: true,
                            message: "Password"
                        }
                    }
                }, (err, result) => {
                    _login({
                        email: result.email,
                        password: result.password
                    });
                }); 
            }
        });
    }

    setupVorpal() {
        this.vorpal = require("vorpal")();

        this.vorpal
            .command("logout", "Sign out")
            .action((args, callback) => {
                this.logout();
            });

        this.vorpal
            .command("alias <alias> <thread>", "Register a new alias for a thread")
            .action((args, callback) => {
                this.addAlias(args.alias, args.thread);
                callback();
            });

        this.vorpal
            .command("aliases", "Retrieve a list of aliases")
            .action((args, callback) => {
                Object.keys(this.aliases).forEach((key) => {
                    this.vorpal.log(`${key}: ${this.aliases[key]}`);
                });
                callback();
            });

        /** Broken */
        this.vorpal
            .command("getID <thread>", "Get the ID of a thread")
            .action((args, callback) => {
                this.getThreadID(args.thread)
                    .then(this.vorpal.log)
                    .catch(() => {
                        this.vorpal.log(`No thread with name ${args.thread} found.`);
                    });
                callback();
            });

        this.vorpal
            .command("msg <recipient> <message>", "Send a new message")
            .action((args, callback) => {
                if(args.recipient in this.aliases) {
                    this.sendMessage(
                        {body: args.message}, this.aliases[args.recipient])
                        .then(() => {})
                        .catch(() => {});
                }
                callback();
            });

        /** Broken */
        this.vorpal
            .command("count <alias>", "Retrieve the total number of messages"
                    + " exchanged in a given thread.")
            .action((args, callback) => {
                if(args.alias in this.aliases) {
                    this.getThreadInfo(this.aliases[args.alias], true).then(() => {
                        this.vorpal.log(`There are ${threadInfo.messageCount}` +
                                " messages in this thread.");
                        callback();
                    }).catch((err) => {});
                }
                this.vorpal.log(`No thread with alias ${args.alias} found.`)
                callback();
            });
        
        this.vorpal
            .delimiter(">")
            .show();

        this.vorpal.log("Logged in");
    }

    addAlias(alias, thread) {
        this.aliases[alias] = thread;
        this.updateAliasFile();
    }

    removeAlias(alias) {
        delete this.aliases[alias];
        this.updateAliasFile();
    }

    updateAliasFile() {
        let list = {};
        if(fs.existsSync("aliases.json")) {
            list = JSON.parse(fs.readFileSync("aliases.json", "utf8"));
        }
        list[this.userID] = this.aliases;
        fs.writeFileSync("aliases.json", JSON.stringify(list));
    }

    getID(threadName) {
        for(threadID in this.data.threads) {
            if(this.data.threads[threadID].name == threadName) {
                this.vorpal.log(threadID);
                return;
            }
        }

        this.vorpal.log(`No thread with name ${threadName} found.`);
    }

    logout() {
        this.api.logout((err) => {
            if(!err) {
                fs.unlinkSync("appstate.json");
                this.vorpal.hide();
                console.log("Logged out");
                process.exit();
            } else {
                this.vorpal.log("There was a problem logging out.");
            }
        });
    }

    sendMessage(message, threadID) {
        return new Promise((resolve, reject) => {
            this.api.sendMessage(message, threadID, (err, info) => {
                if(!err) {
                    resolve();
                } else {
                    reject();
                }
            });
        });
    }

    readMessage(message) {
        this.getUserInfo(message.senderID)
        .then(() => {
            this.getThreadInfo(message.threadID);
        }).then(() => {
            let userInfo = this.data.senders[message.senderID];
            let threadInfo = this.data.threads[message.threadID];
            this.vorpal.log(userInfo.name +
                (message.isGroup ? " to " + threadInfo.name : "") + ": " + 
                message.body);
        }).catch((err) => {
            this.vorpal.log(err);
        });
    }

    getUserInfo(userID, force = false) {
        return new Promise((resolve, reject) => {
            if(userID in this.data.senders && !force) {
                resolve()
            } else {
                this.api.getUserInfo(userID, (err, info) => {
                    if(!err) {
                        this.data.senders[userID] = info[userID];
                        resolve();
                    } else {
                        reject(err);
                    }
                });
            }
        });
    }

    getThreadInfo(threadID, force = false) {
        return new Promise((resolve, reject) => {
            if(threadID in this.data.threads && !force) {
                resolve();
            } else {
                this.api.getThreadInfo(threadID, (err, info) => {
                    if(!err) {
                        this.data.threads[threadID] = info;
                        resolve();
                    } else {
                        reject(err);
                    }
                });
            }
        });
    }

    getThreadID(thread) {
        return new Promise((resolve, reject) => {
            for(threadID in this.data.threads) {
                if(data.threads[threadID].name === thread) {
                    resolve(threadID);
                    return;
                }
            }

            reject();
        });
    }
}