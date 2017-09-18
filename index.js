var fs = require("fs");
var prompt = require('prompt');
var login = require("facebook-chat-api");

if(fs.existsSync('appstate.json')) {
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

var authInput = {
    properties: {
        code: {
            required: true,
            message: "Enter your two-factor authentication code"
        }
    }
};

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

        console.log("Logged in");

        fs.writeFileSync('appstate.json', JSON.stringify(api.getAppState()));

        api.listen((err, message) => {
            console.error(message.body);
            //api.sendMessage(message.body, message.threadID);
        });
    });
}
