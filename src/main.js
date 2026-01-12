const { spawn } = require('child_process');
const fs = require('fs');

const UUID = process.env.UUID || '0a6568ff-ea3c-4271-9020-450560e10d65';
const PORT = process.env.PORT || 8080;
const CFIP = process.env.CFIP || 'www.visa.com.sg';

console.log("Starting Service...");

// Xray Config Setup
const config = {
    inbounds: [{
        port: parseInt(PORT),
        protocol: "vless",
        settings: { clients: [{ id: UUID }], decryption: "none" },
        streamSettings: { network: "ws", wsSettings: { path: "/vless" } }
    }],
    outbounds: [{ protocol: "freedom" }]
};
fs.writeFileSync('./config.json', JSON.stringify(config));

// Xray Running
const xray = spawn('./xray', ['-c', './config.json']);

// Cloudflared Argo Tunnel Running
const argo = spawn('./cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`]);

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
