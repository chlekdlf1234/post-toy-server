import nodemailer from "nodemailer";
import AWS from 'aws-sdk';
import path from 'path';

export async function sendEmail(to: string, html: string) {
    AWS.config.loadFromPath(path.join(__dirname, "../") + '/aws_config.json');

    let transporter = nodemailer.createTransport({
        SES: new AWS.SES()
    })

    await transporter.sendMail({
        from: 'chlekdlf12@naver.com',
        to: to,
        subject: 'Node.js에서 발송한 메일',
        html
    });
}
