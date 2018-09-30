import { Color, discoverMoveHub } from "../src/moveHub";

function timeout(ms: number) {
    return new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
}

function readLine() {
    return new Promise<Buffer>((resolve) => process.stdin.once("data", (data) => resolve(data)));
}

async function main() {
    console.log("Looking for MoveHub...");
    const moveHub = await discoverMoveHub();
    console.log("Connected. Press return to disconnect.");

    let isTurning = false;
    async function turn() {
        if (!isTurning) {
            isTurning = true;
            await moveHub.led(Color.Red);
            await moveHub.motorAB.stop();
            await moveHub.motorD.angledAndWait(30, 10);
            await moveHub.motorD.angledAndWait(60, -10);
            await moveHub.motorD.angledAndWait(30, 10);
            await moveHub.motorAB.angledAndWait(620, 20, -20);
            await moveHub.led(Color.Off);
            await moveHub.motorAB.constant(40);
            isTurning = false;
        }
    }

    await moveHub.colorAndDistanceC.subscribe("colorAndDistance", (cd) => {
        if (cd.distance < 0.2) {
            turn();
        }
    });
    await moveHub.motorAB.setSpeed(true);
    await moveHub.motorAB.subscribe("speed", (speed) => {
        if (speed === 0) {
            turn();
        }
    });

    try {
        await readLine();
        await moveHub.disconnect();
        console.log("Disconnected.");
    } finally {
        process.stdin.end();
    }
}

main();
