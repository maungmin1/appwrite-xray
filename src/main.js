const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

module.exports = async (context) => {
    // Environment Variables
    const UUID = process.env.UUID || '0a6568ff-ea3c-4271-9020-450560e10d65';
    const PORT = process.env.PORT || 8080;
    const CFIP = process.env.CFIP || 'www.visa.com.sg';

    const download = (url, dest) => {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    return download(res.headers.location, dest).then(resolve).catch(reject);
                }
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    fs.chmodSync(dest, '755'); // ခွင့်ပြုချက်ပေးခြင်း
                    resolve();
                });
            }).on('error', reject);
        });
    };

    try {
        context.log("Cleaning and Downloading binaries...");
        //old files deleted
        if (fs.existsSync('/tmp/xray')) fs.unlinkSync('/tmp/xray');
        if (fs.existsSync('/tmp/cloudflared')) fs.unlinkSync('/tmp/cloudflared');

        // Direct Links မ
        await Promise.all([
            download("https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip", "/tmp/xray.zip"),
            download("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", "/tmp/cloudflared")
        ]);

        // UNZIP file (Xray)
        context.log("Extracting Xray...");
        const unzip = spawn('unzip', ['-o', '/tmp/xray.zip', 'xray', '-d', '/tmp/']);
        await new Promise((res) => unzip.on('exit', res));
        fs.chmodSync('/tmp/xray', '755');

        // Config setup
        const config = {
            inbounds: [{
                port: parseInt(PORT),
                protocol: "vless",
                settings: { clients: [{ id: UUID }], decryption: "none" },
                streamSettings: { network: "ws", wsSettings: { path: "/vless" } }
            }],
            outbounds: [{ protocol: "freedom" }]
        };
        fs.writeFileSync('/tmp/config.json', JSON.stringify(config));

        context.log("Launching services...");
        const xray = spawn('/tmp/xray', ['-c', '/tmp/config.json']);
        const argo = spawn('/tmp/cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);

        argo.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('.trycloudflare.com')) {
                const link = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
                if (link) {
                    context.log(`\n--- NODE READY ---`);
                    context.log(`VLESS Link: vless://${UUID}@${CFIP}:443?encryption=none&security=tls&type=ws&host=${link[0].replace('https://', '')}&path=%2Fvless#Appwrite-Node`);
                }
            }
        });

        // 3minites wait closed Function
        await new Promise(resolve => setTimeout(resolve, 180000));
        return context.res.send("Execution session finished.");

    } catch (err) {
        context.error("Error occurred: " + err.message);
        return context.res.send("Failed.");
    }
};
