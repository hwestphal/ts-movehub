import { EventEmitter } from "events";
import * as noble from "noble-uwp";

export const enum Color {
    Off,
    Black = 0,
    Pink,
    Purple,
    Blue,
    LightBlue,
    Cyan,
    Green,
    Yellow,
    Orange,
    Red,
    White,
}

export const enum Orientation {
    Back,
    Up,
    Down,
    Left,
    Right,
    Front,
}

const CMD_MOTOR_CONSTANT_SINGLE = Buffer.from([0x0a, 0x00, 0x81, 0x00, 0x11, 0x01, 0x00, 0x64, 0x7f, 0x03]);
const CMD_MOTOR_CONSTANT_GROUP = Buffer.from([0x0b, 0x00, 0x81, 0x00, 0x11, 0x02, 0x00, 0x00, 0x64, 0x7f, 0x03]);
const CMD_MOTOR_TIMED_SINGLE = Buffer.from([0x0c, 0x00, 0x81, 0x00, 0x11, 0x09, 0x00, 0x00, 0x00, 0x64, 0x7f, 0x03]);
const CMD_MOTOR_TIMED_GROUP =
    Buffer.from([0x0d, 0x00, 0x81, 0x00, 0x11, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x64, 0x7f, 0x03]);
const CMD_MOTOR_ANGLED_SINGLE =
    Buffer.from([0x0e, 0x00, 0x81, 0x00, 0x11, 0x0b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64, 0x7f, 0x03]);
const CMD_MOTOR_ANGLED_GROUP =
    Buffer.from([0x0f, 0x00, 0x81, 0x00, 0x11, 0x0c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64, 0x7f, 0x03]);
const CMD_SUBSCRIBE_ANGLE = Buffer.from([0x0a, 0x00, 0x41, 0x00, 0x02, 0x01, 0x00, 0x00, 0x00, 0x01]);
const CMD_SUBSCRIBE_SPEED = Buffer.from([0x0a, 0x00, 0x41, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x01]);

class Motor {
    private eventEmitter = new EventEmitter();
    private subscribed = false;
    private speed = false;

    constructor(private port: number, private characteristic: noble.Characteristic) {
        characteristic.on("data", (data: Buffer) => this.onData(data));
    }

    constant(speed: number, speedB?: number) {
        let cmd: Buffer;
        if (speedB === undefined) {
            cmd = Buffer.from(CMD_MOTOR_CONSTANT_SINGLE);
        } else {
            cmd = Buffer.from(CMD_MOTOR_CONSTANT_GROUP);
            cmd.writeInt8(speedB, 7);
        }
        cmd.writeUInt8(this.port, 3);
        cmd.writeInt8(speed, 6);
        return writeData(this.characteristic, cmd);
    }

    timed(time: number, speed: number, speedB?: number) {
        let cmd: Buffer;
        if (speedB === undefined) {
            cmd = Buffer.from(CMD_MOTOR_TIMED_SINGLE);
        } else {
            cmd = Buffer.from(CMD_MOTOR_TIMED_GROUP);
            cmd.writeInt8(speedB, 9);
        }
        cmd.writeUInt8(this.port, 3);
        cmd.writeUInt16LE(time, 6);
        cmd.writeInt8(speed, 8);
        return writeData(this.characteristic, cmd);
    }

    timedAndWait(time: number, speed: number, speedB?: number) {
        return this.runAndWait(() => this.timed(time, speed, speedB));
    }

    angled(angle: number, speed: number, speedB?: number) {
        let cmd: Buffer;
        if (speedB === undefined) {
            cmd = Buffer.from(CMD_MOTOR_ANGLED_SINGLE);
        } else {
            cmd = Buffer.from(CMD_MOTOR_ANGLED_GROUP);
            cmd.writeInt8(speedB, 11);
        }
        cmd.writeUInt8(this.port, 3);
        cmd.writeUInt32LE(angle, 6);
        cmd.writeInt8(speed, 10);
        return writeData(this.characteristic, cmd);
    }

    angledAndWait(angle: number, speed: number, speedB?: number) {
        return this.runAndWait(() => this.angled(angle, speed, speedB));
    }

    stop() {
        return this.constant(0);
    }

    subscribe(event: "motorOn" | "motorOff", listener: () => void): Promise<void>;
    subscribe(event: "angle" | "speed", listener: (value: number) => void): Promise<void>;
    async subscribe(event: string, listener: (value: any) => void) {
        if (!this.subscribed && (event === "angle" || event === "speed")) {
            this.subscribed = true;
            await this.writeSubscribeCommand();
        }
        this.eventEmitter.addListener(event, listener);
    }

    get speedMode() {
        return this.speed;
    }

    async setSpeedMode(speed: boolean) {
        if (this.speed !== speed) {
            this.speed = speed;
            if (this.subscribed) {
                await this.writeSubscribeCommand();
            }
        }
    }

    private writeSubscribeCommand() {
        const cmd = Buffer.from(this.speed ? CMD_SUBSCRIBE_SPEED : CMD_SUBSCRIBE_ANGLE);
        cmd.writeUInt8(this.port, 3);
        return writeData(this.characteristic, cmd);
    }

    private runAndWait(cmd: () => Promise<void>) {
        return new Promise<void>((resolve, reject) => {
            const motorOn = () => {
                this.eventEmitter.once("motorOff", () => resolve());
                this.eventEmitter.removeListener("motorRunning", motorRunning);
            };
            const motorRunning = () => {
                this.eventEmitter.removeListener("motorOn", motorOn);
                reject("motor is still running");
            };
            this.eventEmitter.once("motorRunning", motorRunning);
            this.eventEmitter.once("motorOn", motorOn);
            cmd().catch((error) => {
                this.eventEmitter.removeListener("motorRunning", motorRunning);
                this.eventEmitter.removeListener("motorOn", motorOn);
                reject(error);
            });
        });
    }

    private onData(data: Buffer) {
        if (data.slice(0, 4).equals(Buffer.from([0x05, 0x00, 0x82, this.port]))) {
            const value = data.readUInt8(4);
            if (value === 0x01) {
                this.eventEmitter.emit("motorOn");
            } else if (value === 0x05) {
                this.eventEmitter.emit("motorRunning");
            } else if (value === 0x0a) {
                this.eventEmitter.emit("motorOff");
            }
        } else if (data.slice(0, 4).equals(Buffer.from([0x08, 0x00, 0x45, this.port]))) {
            this.eventEmitter.emit("angle", data.readInt32LE(4));
        } else if (data.slice(0, 4).equals(Buffer.from([0x05, 0x00, 0x45, this.port]))) {
            this.eventEmitter.emit("speed", data.readInt8(4));
        }
    }

}

interface IColorAndDistanceValue {
    color: Color | undefined;
    distance: number;
}

const CMD_SUBSCRIBE_DISTANCE = Buffer.from([0x0a, 0x00, 0x41, 0x00, 0x08, 0x01, 0x00, 0x00, 0x00, 0x01]);
const CMD_SUBSCRIBE_LUMINOSITY = Buffer.from([0x0a, 0x00, 0x41, 0x00, 0x09, 0x01, 0x00, 0x00, 0x00, 0x01]);

class ColorAndDistance {
    private eventEmitter: EventEmitter | undefined;
    private luminosity = false;

    constructor(private port: number, private characteristic: noble.Characteristic) {
        characteristic.on("data", (data: Buffer) => this.onData(data));
    }

    subscribe(event: "colorAndDistance", listener: (value: IColorAndDistanceValue) => void): Promise<void>;
    subscribe(event: "luminosity", listener: (value: number) => void): Promise<void>;
    async subscribe(event: string, listener: (value: any) => void) {
        if (!this.eventEmitter) {
            this.eventEmitter = new EventEmitter();
            await this.writeSubscribeCommand();
        }
        this.eventEmitter.addListener(event, listener);
    }

    get luminosityMode() {
        return this.luminosity;
    }

    async setLuminosityMode(luminosity: boolean) {
        if (this.luminosity !== luminosity) {
            this.luminosity = luminosity;
            if (this.eventEmitter) {
                await this.writeSubscribeCommand();
            }
        }
    }

    private writeSubscribeCommand() {
        const cmd = Buffer.from(this.luminosity ? CMD_SUBSCRIBE_LUMINOSITY : CMD_SUBSCRIBE_DISTANCE);
        cmd.writeUInt8(this.port, 3);
        return writeData(this.characteristic, cmd);
    }

    private onData(data: Buffer) {
        if (data.slice(0, 4).equals(Buffer.from([0x08, 0x00, 0x45, this.port])) && this.eventEmitter) {
            if (this.luminosity) {
                const value = data.readUInt32LE(4);
                if (value < 1024) {
                    this.eventEmitter.emit("luminosity", value);
                }
            } else {
                const color = data.readUInt8(4);
                let distance = data.readUInt8(5);
                const partial = data.readUInt8(7);
                if (partial > 0) {
                    distance += 1 / partial;
                }
                if (distance > 0) {
                    this.eventEmitter.emit("colorAndDistance", {
                        color: color < 255 ? color : undefined,
                        distance: distance * 0.0254,
                    });
                }
            }
        }
    }

}

interface ITiltValue {
    x: number;
    y: number;
    z: number;
}

const CMD_LED = Buffer.from([0x08, 0x00, 0x81, 0x32, 0x11, 0x51, 0x00, 0x00]);
const CMD_SUBSCRIBE_BUTTON = Buffer.from([0x05, 0x00, 0x01, 0x02, 0x02]);
const CMD_SUBSCRIBE_TILT_PRECISE = Buffer.from([0x0a, 0x00, 0x41, 0x3a, 0x04, 0x08, 0x00, 0x00, 0x00, 0x01]);
const CMD_SUBSCRIBE_TILT_SIMPLE = Buffer.from([0x0a, 0x00, 0x41, 0x3a, 0x02, 0x01, 0x00, 0x00, 0x00, 0x01]);
const EVENT_BUTTON_PRESSED = Buffer.from([0x06, 0x00, 0x01, 0x02, 0x06, 0x01]);
const EVENT_BUTTON_RELEASED = Buffer.from([0x06, 0x00, 0x01, 0x02, 0x06, 0x00]);
const EVENT_TILT_PRECISE = Buffer.from([0x07, 0x00, 0x45, 0x3a]);
const EVENT_TILT_SIMPLE = Buffer.from([0x05, 0x00, 0x45, 0x3a]);

class MoveHub {
    readonly motorA: Motor;
    readonly motorB: Motor;
    readonly motorAB: Motor;
    readonly motorC: Motor;
    readonly motorD: Motor;
    readonly colorAndDistanceC: ColorAndDistance;
    readonly colorAndDistanceD: ColorAndDistance;

    private buttonEventEmitter: EventEmitter | undefined;
    private buttonPressed = false;
    private tiltEventEmitter: EventEmitter | undefined;
    private precise = false;

    constructor(private peripheral: noble.Peripheral, private characteristic: noble.Characteristic) {
        this.motorA = new Motor(0x37, characteristic);
        this.motorB = new Motor(0x38, characteristic);
        this.motorAB = new Motor(0x39, characteristic);
        this.motorC = new Motor(0x01, characteristic);
        this.motorD = new Motor(0x02, characteristic);
        this.colorAndDistanceC = new ColorAndDistance(0x01, characteristic);
        this.colorAndDistanceD = new ColorAndDistance(0x02, characteristic);
        characteristic.on("data", (data: Buffer) => this.onData(data));
    }

    led(color: Color) {
        const cmd = Buffer.from(CMD_LED);
        cmd.writeUInt8(color, 7);
        return writeData(this.characteristic, cmd);
    }

    async subscribeButton(event: "pressed" | "released", listener: () => void) {
        if (!this.buttonEventEmitter) {
            this.buttonEventEmitter = new EventEmitter();
            await writeData(this.characteristic, CMD_SUBSCRIBE_BUTTON);
        }
        this.buttonEventEmitter.addListener(event, listener);
    }

    async subscribeTilt(event: "precise", listener: (value: ITiltValue) => void): Promise<void>;
    async subscribeTilt(event: "simple", listener: (value: Orientation) => void): Promise<void>;
    async subscribeTilt(event: string, listener: (value: any) => void) {
        if (!this.tiltEventEmitter) {
            this.tiltEventEmitter = new EventEmitter();
            await writeData(this.characteristic, this.precise ? CMD_SUBSCRIBE_TILT_PRECISE : CMD_SUBSCRIBE_TILT_SIMPLE);
        }
        this.tiltEventEmitter.addListener(event, listener);
    }

    get tiltPreciseMode() {
        return this.precise;
    }

    async setTiltPreciseMode(precise: boolean) {
        if (this.precise !== precise) {
            this.precise = precise;
            if (this.tiltEventEmitter) {
                await writeData(this.characteristic, precise ? CMD_SUBSCRIBE_TILT_PRECISE : CMD_SUBSCRIBE_TILT_SIMPLE);
            }
        }
    }

    disconnect() {
        return new Promise<void>((r) => this.peripheral.disconnect(() => r()));
    }

    private onData(data: Buffer) {
        if (data.equals(EVENT_BUTTON_PRESSED)) {
            this.buttonPressed = true;
            if (this.buttonEventEmitter) {
                this.buttonEventEmitter.emit("pressed");
            }
        } else if (data.equals(EVENT_BUTTON_RELEASED)) {
            // send first release event only when button was pressed before
            if (this.buttonPressed && this.buttonEventEmitter) {
                this.buttonEventEmitter.emit("released");
            }
        } else if (data.slice(0, 4).equals(EVENT_TILT_PRECISE) && this.tiltEventEmitter) {
            this.tiltEventEmitter.emit("precise", {
                x: data.readInt8(4) * 360 / 256,
                y: data.readInt8(5) * 360 / 256,
                z: data.readInt8(6) * 360 / 256,
            });
        } else if (data.slice(0, 4).equals(EVENT_TILT_SIMPLE) && this.tiltEventEmitter) {
            this.tiltEventEmitter.emit("simple", data.readUInt8(4));
        }
    }

}

function writeData(characteristic: noble.Characteristic, data: Buffer) {
    return new Promise<void>((resolve, reject) => {
        characteristic.write(data, false, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

const MOVE_HUB_SERVICE = "000016231212efde1623785feabcd123";
const MOVE_HUB_CHARACTERISTIC = "000016241212efde1623785feabcd123";

export function discoverMoveHub(timeout: number = 30000, moveHubName = "LEGO Move Hub") {
    return new Promise<MoveHub>((resolve, reject) => {
        const timer = setTimeout(() => {
            noble.stopScanning();
            reject("timeout");
        }, timeout);
        noble.on("discover", (p) => {
            try {
                p.connect((connectError) => {
                    if (connectError) {
                        return;
                    }
                    if (p.advertisement.localName === moveHubName) {
                        clearTimeout(timer);
                        noble.stopScanning();
                        p.discoverSomeServicesAndCharacteristics(
                            [MOVE_HUB_SERVICE],
                            [MOVE_HUB_CHARACTERISTIC],
                            (discoverError, srvs, chrs) => {
                                if (discoverError || chrs.length !== 1) {
                                    p.disconnect();
                                    reject(discoverError || "characteristic not found");
                                } else {
                                    chrs[0].notify(true, (notifyError) => {
                                        if (notifyError) {
                                            p.disconnect();
                                            reject(notifyError);
                                        } else {
                                            // wait some time for all sensors to be initialized
                                            setTimeout(() => resolve(new MoveHub(p, chrs[0])), 2000);
                                        }
                                    });
                                }
                            });
                    } else {
                        p.disconnect();
                    }
                });
            } catch (connectExeption) {
                // ignore
            }
        });
        noble.on("stateChange", (state) => {
            if (state === "poweredOn") {
                noble.startScanning();
            }
        });
    });
}
