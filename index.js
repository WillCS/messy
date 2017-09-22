const fs = require("fs");
const prompt = require('prompt');
const login = require("facebook-chat-api");
const vorpal = require("vorpal")();

var data = {
    threads: {},
    senders: {}
};

var aliases = {};

if(fs.existsSync("appstate.json")) {
    main({
        appState: JSON.parse(fs.readFileSync("appstate.json", "utf8"))
    });
} else {
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
        main({
            email: result.email,
            password: result.password
        });
    });   
}

function main(credentials) {
    var options = {
        logLevel: "silent",
        forceLogin: true
    };

    login(credentials, options, (err, api) => {
        if(err) {
            console.log(err.error);
            switch(err.error) {
                case 'login-approval':
                    prompt.get(authInput, function(authErr, result) {
                        err.continue(result.code);
                    });
                    break;
                default:
                    return console.error(err);
            }
        }
        
        fs.writeFileSync("appstate.json", JSON.stringify(api.getAppState()));

        if(fs.existsSync(("aliases.json"))) {
            var list = JSON.parse(fs.readFileSync("aliases.json", "utf8"));
            if(api.getCurrentUserID() in list) {
                aliases = list[api.getCurrentUserID()];
            }
        }
        
        vorpal
            .delimiter(">")
            .show();

        vorpal.log("Logged in");

        vorpal
            .command("logout", "Sign out of messy")
            .action((args, callback) => {
                api.logout((err) => {
                    if(!err) {
                        fs.unlinkSync("appstate.json");
                        vorpal.hide();
                        console.log("Logged out");
                        process.exit();
                    } else {
                        vorpal.log("There was a problem logging out");
                    }
                    callback();
                });
                
            });

        vorpal
            .command("alias <threadID> <alias>", "Registers a new alias")
            .action((args, callback) => {
                aliases[args.alias] = args.threadID;

                var list = {};
                if(fs.existsSync("aliases.json")) {
                    list = JSON.parse(fs.readFileSync("aliases.json", "utf8"));
                }
                list[api.getCurrentUserID()] = aliases;
                fs.writeFileSync("aliases.json", JSON.stringify(list));
                callback();
            });

        vorpal
            .command("getID <thread>", "Get the thread ID of a specific thread")
            .action((args, callback) => {
                for(threadData in data.threads) {
                    if(data.threads[threadData].name === args.thread) {
                        vorpal.log(threadData);
                        callback();
                        return;
                    }
                }

                vorpal.log(`No thread with name ${args.thread} found.`)

                callback();
            });

        vorpal
            .command("msg <recipient> <message>", "Send a new message")
            .action((args, callback) => {
                if(args.recipient in aliases) {
                    api.sendMessage({body: args.message}, aliases[args.recipient]);
                }
                
                callback();
            });

        vorpal
            .command("aliases", "Retrieve a list of aliases")
            .action((args, callback) => {
                Object.keys(aliases).forEach((key) => {
                    vorpal.log(`${key}: ${aliases[key]}`);
                });

                callback();
            });

        function exit() {
            stream.question("Are you sure you want to exit? ", (answer) => {
                if(answer === "yes") {
                    vorpal.hide();
                    console.log("Exited messy");
                    process.exit();
                }
            });
        }

        api.listen((err, event) => {
            switch(event.type) {
                case "message":
                    readMessage(event, vorpal, api);
                    break;
            }
        });
    });
}

function readMessage(event, vorpal, api) {
    getUserInfo(event.senderID, api, (userInfo) => {
        getThreadInfo(event.threadID, api, (threadInfo) => {
            vorpal.log(`${userInfo.name}${event.isGroup ? " to " + threadInfo.name : ""}: ${event.body}`);
        });
    });
}

function getUserInfo(userID, api, callback) {
    if(userID in data.senders) {
        callback(data.senders[userID]);
    } else {
        api.getUserInfo(userID, (err, info) => {
            if(!err) {
                data.senders[userID] = info[userID];
                callback(info[userID]);
            }
        });
    }
}

function getThreadInfo(threadID, api, callback) {
    if(threadID in data.threads) {
        callback(data.threads[threadID]);
    } else {
        api.getThreadInfo(threadID, (err, info) => {
            if(!err) {
                data.threads[threadID] = info;
                callback(info);
            }
        });
    }
}
