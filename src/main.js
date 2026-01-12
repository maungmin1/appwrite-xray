const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');

const UUID = process.env.UUID || '0a6568ff-ea3c-4271-9020-450560e10d65';
const PORT = process.env.PORT || 8080;
const CFIP = process.env.CFIP || 'www.visa.com.sg';

// Binary files Download Links
const BINARIES = {
    xray: "https://github.com/eooce/test/raw/main/xray",
    cloudflared: "https://github.com/eooce/test/raw/main/cloudflared"
};

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

async function init() {
    console.log("Downloading binaries into memory...");
    try {
        // /tmp folder in downloading
        await Promise.all([
            download(BINARIES.xray, '/tmp/xray'),
            download(BINARIES.cloudflared, '/tmp/cloudflared')
        ]);

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

        console.log("Starting Argo Tunnel...");
        const argo = spawn('/tmp/cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);
        const xray = spawn('/tmp/xray', ['-c', '/tmp/config.json']);

        argo.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('.trycloudflare.com')) {
                const link = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
                if (link) {
                    console.log("\n--- NODE READY ---");
                    console.log(`VLESS Link: vless://${UUID}@${CFIP}:443?encryption=none&security=tls&type=ws&host=${link[0].replace('https://', '')}&path=%2Fvless#Appwrite-Clean`);
                    console.log("------------------\n");
                }
            }
        });
    } catch (err) {
        console.error("Download failed:", err);
    }
}

init();
