import { getCurrentDatetime } from "./tools.js";

console.log("default:     ", getCurrentDatetime());
console.log("hour:minute: ", getCurrentDatetime("%H:%M"));
console.log("with weekday:", getCurrentDatetime("%A, %d %B %Y"));

// Errors are part of the design: Claude can read them and retry with a fix
for (const bad of ["", "%Q"]) {
    try {
        getCurrentDatetime(bad);
    } catch (err) {
        console.log(`bad format ${JSON.stringify(bad)} ->`, (err as Error).message);
    }
}
