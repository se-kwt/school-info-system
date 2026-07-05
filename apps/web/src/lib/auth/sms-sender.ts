export interface SmsSender {
  send(phone: string, message: string): Promise<void>;
}

export class ConsoleSmsSender implements SmsSender {
  async send(phone: string, message: string): Promise<void> {
    console.log(`[SMS to ${phone}]: ${message}`);
  }
}
