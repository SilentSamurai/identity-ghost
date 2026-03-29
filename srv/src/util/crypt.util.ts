import {createHash, generateKeyPairSync, randomBytes, scryptSync, timingSafeEqual,} from "crypto";
import {generate} from "otp-generator";

function base64UrlEncode(input: Buffer | string): string {
    let encoded = Buffer.from(input).toString("base64");
    encoded = encoded
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return encoded;
}

export class CryptUtil {
    public static generateKeyPair() {
        return generateKeyPairSync("rsa", {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: "spki",
                format: "pem",
            },
            privateKeyEncoding: {
                type: "pkcs8",
                format: "pem",
            },
        });
    }

    public static generateECKeyPair() {
        return generateKeyPairSync("ec", {
            namedCurve: "P-256",
            publicKeyEncoding: {
                type: "spki",
                format: "pem",
            },
            privateKeyEncoding: {
                type: "pkcs8",
                format: "pem",
            },
        });
    }

    public static generateClientIdAndSecret() {
        const clientId = this.generateClientId();
        const {clientSecret, salt} = this.generateClientSecret(clientId);
        return {clientId, clientSecret, salt};
    }

    public static verifyClientId(storedSecret, suppliedKey, salt) {
        const buffer = scryptSync(suppliedKey, salt, 64) as Buffer;
        return timingSafeEqual(Buffer.from(storedSecret, "hex"), buffer);
    }

    public static verifyClientSecret(
        storedSecret: string,
        providedSecret: string,
    ) {
        if (storedSecret.length !== providedSecret.length) {
            return false;
        }
        return timingSafeEqual(
            Buffer.from(storedSecret, "hex"),
            Buffer.from(providedSecret, "hex"),
        );
    }

    public static generateCodeVerifier(length: number = 64): string {
        const verifier = randomBytes(length);
        return base64UrlEncode(verifier).substring(0, length);
    }

    public static generateCodeChallenge(
        verifier: string,
        method: string,
    ): string {
        if (method === "S256") {
            // commenting as cannot use in http context only https allowed.
            const hash = createHash("sha256").update(verifier).digest();
            return base64UrlEncode(hash).replace(/=+$/, "");
        }
        if (method === "OWH32") {
            return this.oneWayHash(verifier);
        }
        return verifier;
    }

    public static oneWayHash(plain: string) {
        const FNV_PRIME = 16777619;
        const OFFSET_BASIS = 2166136261;
        let hash = OFFSET_BASIS;
        for (let i = 0; i < plain.length; i++) {
            hash ^= plain.charCodeAt(i);
            hash = (hash * FNV_PRIME) >>> 0; // Force to 32-bit integer
        }
        const finalHash = hash >>> 0;
        return `${finalHash}`; // Convert to unsigned 32-bit integer
    }

    public static generateRandomString(length: number): string {
        const characters =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let randomString = "";
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            randomString += characters.charAt(randomIndex);
        }
        return randomString;
    }

    public static generateOTP(length: number): string {
        return generate(length, {
            digits: true,
            lowerCaseAlphabets: false,
            upperCaseAlphabets: false,
            specialChars: false,
        });
    }

    private static generateClientId() {
        const buffer = randomBytes(16);
        return buffer.toString("hex");
    }

    private static generateClientSecret(clientId: string) {
        const salt = randomBytes(8).toString("hex");
        const buffer = scryptSync(clientId, salt, 64) as Buffer;
        return {clientSecret: buffer.toString("hex"), salt};
    }
}
