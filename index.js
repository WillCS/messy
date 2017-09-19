const fs = require("fs");
const prompt = require('prompt');
const login = require("facebook-chat-api");
const readline = require("readline");

if(fs.existsSync("appstate.json")) {
    main({
        appState: JSON.parse(fs.readFileSync("appstate.json", "utf8"))
    });
} else {
    var input = {
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
    };

    prompt.colors = false;
    prompt.message = "";
    prompt.start();
    prompt.get(input, (err, result) => {
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

        var stream = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });

        stream.on("line", (line) => {
            if(line === "logout") {
                api.logout((err) => {
                    if(!err) {
                        fs.unlinkSync("appstate.json");
                        console.log("Logged out");
                        process.exit();
                    } else {
                        console.log("There was a problem logging out");
                    }
                });
            }

            if(line === "exit") {
                exit();
            }
        });

        function exit() {
            stream.question("Are you sure you want to exit? ", (answer) => {
                if(answer === "yes") {
                    process.exit();
                }
            });
        }

        stream.on("SIGINT", exit);
        stream.on("SIGTSTP", exit);

        console.log("Logged in");

        fs.writeFileSync("appstate.json", JSON.stringify(api.getAppState()));

        api.listen((err, event) => {
            switch(event.type) {
                case "message":
                    readMessage(event, api);
                    break;
            }
        });
    });
}

var data = {
    threads: [

    ],
    senders: [

    ]
};

function readMessage(event, api) {
    getUserInfo(event.senderID, api, (userInfo) => {
        getThreadInfo(event.threadID, api, (threadInfo) => {
            console.log(`${userInfo.name}${event.isGroup ? " to " + threadInfo.name : ""}: ${event.body}`);
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
