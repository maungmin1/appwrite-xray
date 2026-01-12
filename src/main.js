const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

// Appwrite Function started run this Function
module.exports = async (context) => {
    const UUID = process.env.UUID || '0a6568ff-ea3c-4271-9020-450560e10d65';
    const PORT = process.env.PORT || 8080;
    const CFIP = process.env.CFIP || 'www.visa.com.sg';

    context.log("Starting Node Process...");

    const download = (url, dest) => {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, (res) => {
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    fs.chmodSync(dest, '755');
                    resolve();
                });
            }).on('error', reject);
        });
    };

    try {
        context.log("Downloading binaries...");
        await Promise.all([
            download("https://github.com/eooce/test/raw/main/xray", "/tmp/xray"),
            download("https://github.com/eooce/test/raw/main/cloudflared", "/tmp/cloudflared")
        ]);

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
                context.log(`NODE READY: ${link[0]}`);
            }
        });

        // Appwrite Function ကို တုံ့ပြန်မှုပေးရန်
        return context.res.send("VLESS Node is running!");

    } catch (err) {
        context.error("Error occurred: " + err.message);
        return context.res.send("Failed to start.");
    }
};
