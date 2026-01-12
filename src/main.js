const { spawn, execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

module.exports = async (context) => {
    const UUID = process.env.UUID || '0a6568ff-ea3c-4271-9020-450560e10d65';
    const PORT = process.env.PORT || 8080;
    const CFIP = process.env.CFIP || 'www.visa.com.sg';

    // Folder နာမည်ကို လုံးဝမတူအောင် random ဆောက်ခြင်း
    const randomId = crypto.randomBytes(4).toString('hex');
    const WORK_DIR = `/tmp/app_${randomId}`;
    const xrayPath = path.join(WORK_DIR, 'xray');
    const argoPath = path.join(WORK_DIR, 'cloudflared');

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
                    fs.chmodSync(dest, '755');
                    resolve();
                });
            }).on('error', reject);
        });
    };

    try {
        context.log(`Target Directory: ${WORK_DIR}`);
        fs.mkdirSync(WORK_DIR, { recursive: true });

        context.log("Downloading binaries...");
        await Promise.all([
            download("https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip", path.join(WORK_DIR, 'xray.zip')),
            download("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", argoPath)
        ]);

        context.log("Extracting Xray...");
        execSync(`unzip -o ${path.join(WORK_DIR, 'xray.zip')} xray -d ${WORK_DIR}`);
        fs.chmodSync(xrayPath, '755');

        const config = {
            inbounds: [{
                port: parseInt(PORT),
                protocol: "vless",
                settings: { clients: [{ id: UUID }], decryption: "none" },
                streamSettings: { network: "ws", wsSettings: { path: "/vless" } }
            }],
            outbounds: [{ protocol: "freedom" }]
        };
        fs.writeFileSync(path.join(WORK_DIR, 'config.json'), JSON.stringify(config));

        context.log("Launching services...");
        
        // Spawn options တွင် Error handle လုပ်ရန် ထပ်တိုးထားသည်
        const xray = spawn(xrayPath, ['-c', path.join(WORK_DIR, 'config.json')], { detached: true });
        const argo = spawn(argoPath, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);

        xray.on('error', (err) => context.error("Xray Spawn Error: " + err.message));
        argo.on('error', (err) => context.error("Argo Spawn Error: " + err.message));

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

        // ၅ မိနစ်ခန့် စောင့်ပေးခြင်း
        await new Promise(resolve => setTimeout(resolve, 300000));
        return context.res.send("Success");

    } catch (err) {
        context.error("Execution Error: " + err.message);
        return context.res.send("Failed");
    }
};
