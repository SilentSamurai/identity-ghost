import {createHash, generateKeyPairSync, randomBytes} from "crypto";
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


}
