import { Color, discoverMoveHub, Orientation } from "../src/moveHub";

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
    let isUp = true;

    async function turn() {
        if (!isTurning && isUp) {
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
    await moveHub.motorAB.setSpeedMode(true);
    await moveHub.motorAB.subscribe("speed", (speed) => {
        if (speed === 0) {
            turn();
        }
    });
    await moveHub.subscribeTilt("simple", async (value) => {
        const old = isUp;
        const cur = value === Orientation.Up;
        isUp = cur;
        if (old && !cur) {
            await moveHub.motorAB.stop();
            for (let i = 0; i < 10; i++) {
                await moveHub.led(Color.Green);
                await timeout(100);
                await moveHub.led(Color.Off);
            }
        } else if (!old && cur) {
            await moveHub.motorAB.constant(40);
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
