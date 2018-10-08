# ts-movehub

This is a Typescript library for interacting with a [LEGO® Boost](https://www.lego.com/themes/boost) Move Hub. It was developed for Windows 10 but might be working with other operating systems.

It uses [noble-uwp](https://github.com/jasongin/noble-uwp) — a Bluetooth LE API for Node and Windows 10 — and is based on the reverse engineering work found at https://github.com/JorgePe/BOOSTreveng.

## Features

- Motor (constant, timed and angled)
- Motor notifications (motor on, motor off, angle and speed)
- Color and distance sensor notifications (color/distance and luminosity)
- LED
- Button notifications (pressed and released)
- Tilt sensor notifications (3 axis simple and precise)

See [here](examples/example1.ts) for a usage example.
