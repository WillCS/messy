const fs = require("fs");
const chatAPI = require("facebook-chat-api");
const thread = require("./thread");

var app;

exports.app = class {
    constructor() {
        this.threadInfo = {};
        this.senderInfo = {};
        this.aliases = {};
        this.threads = {};
        this.activeThread = null;
        
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
        this.threadContext = require("vorpal")();

        // logout
        this.vorpal
            .command("logout", "Sign out")
            .action((args, callback) => {
                this.logout();
            });

        // alias
        this.vorpal
            .command("alias <alias> <thread>", "Register a new alias for a thread")
            .action((args, callback) => {
                this.addAlias(args.alias, args.thread);
                callback();
            });

        // aliases
        this.vorpal
            .command("aliases", "Retrieve a list of aliases")
            .action((args, callback) => {
                Object.keys(this.aliases).forEach((key) => {
                    this.vorpal.log(`${key}: ${this.aliases[key]}`);
                });
                callback();
            });

        // getID
        this.vorpal
            .command("getID <thread>", "Get the ID of a thread")
            .action((args, callback) => {
                let threadID = this.getThreadID(args.thread);
                    if(threadID) {
                        this.vorpal.log(threadID);
                    } else {
                        this.vorpal.log(`No thread with name ${args.thread} found.`);
                    }
                callback();
            });

        // msg
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

        // count
        this.vorpal
            .command("count <alias>", "Retrieve the total number of messages"
                    + " exchanged in a given thread.")
            .action((args, callback) => {
                if(args.alias in this.aliases) {
                    this.getThreadInfo(this.aliases[args.alias], true).then(() => {
                        this.vorpal.log(`There are ${this.threadInfo[this.aliases[args.alias]].messageCount}` +
                                " messages in this thread.");
                    }).catch((err) => {});
                } else {
                    this.vorpal.log(`No thread with alias ${args.alias} found.`);
                }
                callback();
            });
        
        this.vorpal
            .mode("thread <thread>")
            .description("Scope to a specific thread")
            .delimiter("")
            .init((args, callback) => {
                if(args.thread in this.aliases) {
                    let threadID = this.aliases[args.thread];
                    if(!(threadID in this.threads)) {
                        this.threads[threadID] = 
                                new thread.thread(this.api, threadID);
                    }

                    this.activeThread = this.threads[threadID];
                    callback();
                }
            }).action((command, callback) => {
                this.sendMessage({body: command}, this.activeThread.threadID)
                    .then(() => {})
                    .catch(() => {});
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
            let userInfo = this.senderInfo[message.senderID];
            let threadInfo = this.threadInfo[message.threadID];
            this.vorpal.log(userInfo.name +
                (message.isGroup ? " to " + threadInfo.name : "") + ": " + 
                message.body);
        }).catch((err) => {
            this.vorpal.log(err);
        });
    }

    getUserInfo(userID, force = false) {
        return new Promise((resolve, reject) => {
            if(userID in this.senderInfo && !force) {
                resolve()
            } else {
                this.api.getUserInfo(userID, (err, info) => {
                    if(!err) {
                        this.senderInfo[userID] = info[userID];
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
            if(threadID in this.threadInfo && !force) {
                resolve();
            } else {
                this.api.getThreadInfo(threadID, (err, info) => {
                    if(!err) {
                        this.threadInfo[threadID] = info;
                        resolve();
                    } else {
                        reject(err);
                    }
                });
            }
        });
    }

    getThreadID(thread) {
        for(let threadID in this.threadInfo) {
            if(this.threadInfo[threadID].name === thread) {
                return threadID;
            }
        }
    }
}