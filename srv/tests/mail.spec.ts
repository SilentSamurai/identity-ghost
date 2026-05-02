// test-send.js
import {createFakeSmtpServer, EmailSearchCriteria, FakeSmtpServer} from "../src/mail/FakeSmtpServer";
import {setupConsole} from "./helper.fixture";

const nodemailer = require('nodemailer');

const MAIL_PORT = 0; // OS assigns a free port — enables parallel test runs
const MAIL_HOST = '127.0.0.1';

async function sendTestEmail(port: number) {
    const transporter = nodemailer.createTransport({
        host: MAIL_HOST,
        port,
        secure: false,
        tls: {
            rejectUnauthorized: false
        }
    });

    await transporter.sendMail({
        from: '"Tester" <tester@example.com>',
        to: 'recipient@example.com',
        subject: 'Hello from Node',
        text: 'This is a test email using nodemailer + fake SMTP server.'
    });

    console.log('✅ Test email sent');
}


describe("Fake Smtp Server Test", () => {

    let smtpServer: FakeSmtpServer;

    beforeAll(async () => {
        setupConsole();
        smtpServer = createFakeSmtpServer({port: MAIL_PORT, host: MAIL_HOST, controlEnabled: false});
        await smtpServer.listen();
    })

    afterAll(async () => {
        await smtpServer.close();
    })

    it('should work', async () => {
        await sendTestEmail(smtpServer.boundPort);

        const search: EmailSearchCriteria = {
            to: "recipient@example.com",
            subject: /Hello.*/i,
        }
        const email = await smtpServer.waitForEmail(search);

        expect(email).toBeDefined();
        expect(email.to['text']).toBe("recipient@example.com");
        expect(email.from.text).toBe(`"Tester" <tester@example.com>`)
    });

})
