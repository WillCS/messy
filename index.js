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
                    api.getUserInfo(event.senderID, (err, obj) => {
                        if(err) {

                        } else {
                            console.log(obj[event.senderID].name + ": " + event.body);
                        }
                    });
                    break;
            }
            
           // console.log(event.body);
            //api.sendMessage(message.body, message.threadID);
        });
    });
}