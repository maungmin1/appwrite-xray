const { spawn, execSync } = require('child_process');
const fs = require('fs');
const https = require('https');

module.exports = async (context) => {
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
                    fs.chmodSync(dest, '755');
                    resolve();
                });
            }).on('error', reject);
        });
    };

    try {
        context.log("Cleaning up old processes and files...");
        // ရှိပြီးသား xray နဲ့ cloudflared process တွေကို အရင်သတ်ပစ်ပါ (ETXTBSY မဖြစ်အောင်)
        try {
            execSync('pkill -f xray || true');
            execSync('pkill -f cloudflared || true');
        } catch (e) {
            context.log("No existing processes found.");
        }

        // ဖိုင်နာမည်ကို ထပ်မတူအောင် အနောက်မှာ random နံပါတ် ထည့်လိုက်ပါ (Busy မဖြစ်စေရန်)
        const timestamp = Date.now();
        const xrayPath = `/tmp/xray_${timestamp}`;
        const argoPath = `/tmp/argo_${timestamp}`;

        context.log("Downloading binaries...");
        await Promise.all([
            download("https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip", "/tmp/xray.zip"),
            download("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", argoPath)
        ]);

        context.log("Extracting Xray...");
        execSync(`unzip -o /tmp/xray.zip xray -d /tmp/ && mv /tmp/xray ${xrayPath}`);
        fs.chmodSync(xrayPath, '755');
        fs.chmodSync(argoPath, '755');

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
        const xray = spawn(xrayPath, ['-c', '/tmp/config.json']);
        const argo = spawn(argoPath, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);

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

        // ၅ မိနစ်ခန့် အလုပ်လုပ်ခိုင်းထားပါ
        await new Promise(resolve => setTimeout(resolve, 300000));
        return context.res.send("Session Finished.");

    } catch (err) {
        context.error("Error occurred: " + err.message);
        return context.res.send("Execution Failed.");
    }
};
