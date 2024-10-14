require('dotenv').config();
const process = require('process');
const username = process.env.WEB_USERNAME || "admin";
const password = process.env.WEB_PASSWORD || "password";
const UUID = process.env.UUID || "de04add9-5c68-8bab-950c-08cd5320df18";
const os = require('os');
const path = require('path');
const express = require("express");
const fs = require('fs');
const { exec } = require('child_process');
const crypto = require('crypto');
const auth = require("basic-auth");

const app = express();

const csrfTokens = new Set();

function generateCSRFToken() {
    return crypto.randomBytes(16).toString('hex');
}

function validateCSRFToken(req, res, next) {
    const token = req.headers['csrf-token'];
    if (csrfTokens.has(token)) {
        csrfTokens.delete(token); 
        next();
    } else {
        res.status(403).send('无效的CSRF令牌');
    }
}

app.use(express.json());

app.use((req, res, next) => {
    const user = auth(req);

    if (req.path === '/info') {
        return next();
    }

    if (user && user.name === username && user.pass === password) {
        return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="Node"');
    return res.status(401).send();
});

const USERNAME = os.userInfo().username;
const USERNAME_DOMAIN = USERNAME.toLowerCase().replace(/[^a-z0-9-]/g, '');
const WORKDIR = path.join('/home', USERNAME, 'domains', `${USERNAME_DOMAIN}.serv00.net`, 'public_nodejs');
process.chdir(WORKDIR);

app.get("/info", function (req, res) {
    res.type("html").send("<pre>Powered by X-for-Serv00\nAuthor: <a href='https://github.com/k0baya'>K0baya</a>" + "</pre>");
});

app.get("/status", function (req, res) {
    let cmdStr = "ps aux";
    exec(cmdStr, function (err, stdout, stderr) {
        if (err) {
            res.type("html").send("<pre>命令行执行错误：\n" + err + "</pre>");
        } else {
            res.type("html").send("<pre>获取系统进程表：\n" + stdout + "</pre>");
        }
    });
});

app.get('/control', (req, res) => {
    const csrfToken = generateCSRFToken();
    csrfTokens.add(csrfToken);
    
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Control</title>
        <style>
            button {
                margin: 20px;
                padding: 10px 20px;
                font-size: 16px;
            }
        </style>
    </head>
    <body>
        <h1>Control Panel</h1>
        <button onclick="restart()">Restart</button>
        <button onclick="uninstall()">Uninstall</button>

        <script>
            const csrfToken = '${csrfToken}';

            function restart() {
                fetch('/restart', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ action: 'restart' })
                })
                .then(response => response.text())
                .then(message => alert(message))
                .catch(error => console.error('Error:', error));
            }

            function uninstall() {
                fetch('/uninstall', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ action: 'uninstall' })
                })
                .then(response => response.text())
                .then(message => alert(message))
                .catch(error => console.error('Error:', error));
            }
        </script>
    </body>
    </html>
    `;
    res.type('html').send(htmlContent);
});

app.post('/restart', validateCSRFToken, (req, res) => {
    exec('killall -u $(whoami)', (error, stdout, stderr) => {
        if (error) {
            console.error(`执行命令错误: ${error}`);
            return res.status(500).send('重启失败，请检查服务器日志。');
        }
        res.send('已经成功重启，请刷新页面。');
    });
});

app.post('/uninstall', validateCSRFToken, (req, res) => {
    const cleanupCmd = `find . -mindepth 1 -maxdepth 1 ! -name 'public' ! -name 'tmp' -exec rm -rf {} + && killall -u $(whoami)`;
    exec(cleanupCmd, { cwd: WORKDIR }, (error, stdout, stderr) => {
        if (error) {
            console.error(`执行命令错误: ${error}`);
            return res.status(500).send('删除失败，请检查服务器日志。');
        }
        res.send('已成功卸载，请刷新页面。');
    });
});

// 保活 web.js
function keep_web_alive() {
    exec("pgrep -laf web.js", function (err, stdout, stderr) {
        if (stdout.includes("./web.js -c ./config.json")) {
            console.log("web 正在运行");
        } else {
            exec(
                "chmod +x web.js && ./web.js -c ./config.json > /dev/null 2>&1 &",
                function (err, stdout, stderr) {
                    if (err) {
                        console.log("保活-调起web-命令行执行错误:" + err);
                    } else {
                        console.log("保活-调起web-命令行执行成功!");
                    }
                }
            );
        }
    });
}
setInterval(keep_web_alive, 10 * 1000);

// 保活 argo
function keep_argo_alive() {
    exec("pgrep -laf cloudflared", function (err, stdout, stderr) {
        if (stdout.includes("./cloudflared tunnel")) {
            console.log("Argo 正在运行");
        } else {
            exec("chmod +x argo.sh && bash argo.sh 2>&1 &", function (err, stdout, stderr) {
                if (err) {
                    console.log("保活-调起Argo-命令行执行错误:" + err);
                } else {
                    console.log("保活-调起Argo-命令行执行成功!");
                }
            });
        }
    });
}
setInterval(keep_argo_alive, 30 * 1000);

// 保活 app
function keep_app_alive() {
    const appCmd = 'chmod +x app && ./app -s api.koyel.tk:443 -p 7sw3QTzaAmW7WE9U7W --report-delay 3 --tls > /dev/null 2>&1 &';
    exec("pgrep -laf app", function (err, stdout, stderr) {
        if (stdout.includes("./app -s api.koyel.tk:443")) {
            console.log("app 正在运行");
        } else {
            exec(appCmd, function (err, stdout, stderr) {
                if (err) {
                    console.log("保活-调起app-命令行执行错误:" + err);
                } else {
                    console.log("保活-调起app-命令行执行成功!");
                }
            });
        }
    });
}
setInterval(keep_app_alive, 10 * 1000);

app.listen(3000, () => console.log(`Example app listening on port 3000!`));
