"use strict";
var io = require('socket.io')(6666);
var http = require('http');
var Router = require('node-simple-router');
var colors = require('colors');
var PythonShell = require('python-shell');
var router = Router();
var callbacks = [];

var options = {
    mode: 'text',
    pythonPath: '/usr/bin/python3',
    args: ['./trained_model_1516104858', '']
};

console.log("Socket server started at port 6666");
console.log("webserver started at port 1234");

router.get("/", function (request, response) {

    response.end(JSON.stringify({response: "Server up and running"}));
});

router.post("/slack/end", function(request, response) {
    callbacks.forEach(function(element) {
        if(element.team == request.post.team_id) {
            element.callback("slack_received", JSON.stringify({message: request.post.event.text}));
        }
    });
    response.end(request.post.challenge);
});

router.post("/github/end", function (request, response) {
    callbacks.forEach(function(element) {
        if(element.githubURL == request.post.repository.html_url) {
            var commits = request.post.commits[0];
            predictMessageAndForward(commits.message, function(commitLabel){
                console.log(JSON.stringify({sender: commits.author.name, message: commits.message, label: commitLabel}));
                element.callback("github_received", JSON.stringify({sender: commits.author.name, message: commits.message, label: commitLabel}));
                console.log(("Github event: " + commits.message).yellow);
            });

        }
    });
    response.end(JSON.stringify({response: "success"}));
});

var server = http.createServer(router);

server.listen(1234);

io.on('connect', function (soc) {
    soc.on("init", function (msg) {
        var userExists = false;
        var json = JSON.parse(msg);
        soc.teamID = json.teamID;
        soc.githubURL = json.githubURL;

        callbacks.forEach(function(element) {
            if(element.socketId == soc.id) {
                element.team = json.teamID;
                element.githubURL = json.githubURL;
                userExists = true;
                console.log(("User " + soc.id + " updated.\nTeamID: " + json.teamID + "\nGithubURL: " + json.githubURL).yellow);
            }
        });

        if(!userExists) {
            callbacks.push({
                team: json.teamID, socketId: soc.id, githubURL: soc.githubURL, callback: function (type, msg) {
                    soc.emit(type, msg);
                    console.log(("sent " + type + " to:" + soc.id).yellow);
                }
            });
        }
        console.log(("Socket connected:" + soc.id +"\nConnections: " + callbacks.length).green);
    });


    soc.on("disconnect", function () {
        callbacks.forEach(function(item, index, object) {
            if (item.socketId == soc.id) {
                object.splice(index, 1);
                console.log(("Removed socket: "  + soc.id +"\nConnections left: " + callbacks.length).red);
            }
        });
    });
});


function predictMessageAndForward(commitMessage, callback){
    options.args[1] = commitMessage;
    PythonShell.run('predict.py', options, function (err, results) {
        if(err) throw err;
        else{
            callback(results[1]);
        }
    });
}

