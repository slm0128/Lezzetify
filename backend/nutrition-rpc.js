const amqp = require('amqplib');
const { randomUUID } = require('crypto');

const QUEUE_NAME = 'nutrition.search';
const REQUEST_TIMEOUT_MS = 12000;

async function createNutritionRpc() {
    if (!process.env.RABBITMQ_URL) {
        throw new Error('RABBITMQ_URL must be configured.');
    }
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const requestChannel = await connection.createConfirmChannel();
    const replyChannel = await connection.createChannel();
    await requestChannel.assertQueue(QUEUE_NAME, { durable: true });
    const { queue: replyQueue } = await replyChannel.assertQueue('', {
        exclusive: true,
        autoDelete: true
    });
    const pending = new Map();
    let connected = true;

    const rejectPending = (error) => {
        connected = false;
        for (const { reject, timer } of pending.values()) {
            clearTimeout(timer);
            reject(error);
        }
        pending.clear();
    };

    connection.on('error', (error) => {
        console.error('RabbitMQ connection error:', error.message);
        rejectPending(new Error('Der Nährwert-Service ist nicht erreichbar.'));
    });
    connection.on('close', () => rejectPending(new Error('Die Verbindung zu RabbitMQ wurde geschlossen.')));
    requestChannel.on('close', () => rejectPending(new Error('Der Nährwert-Service ist nicht erreichbar.')));
    replyChannel.on('close', () => rejectPending(new Error('Der Nährwert-Service ist nicht erreichbar.')));

    await replyChannel.consume(replyQueue, (message) => {
        if (!message) {
            return;
        }
        const request = pending.get(message.properties.correlationId);
        if (!request) {
            return;
        }

        pending.delete(message.properties.correlationId);
        clearTimeout(request.timer);
        try {
            request.resolve(JSON.parse(message.content.toString()));
        } catch (error) {
            request.reject(new Error('Der Nährwert-Service hat eine ungültige Antwort gesendet.'));
        }
    }, { noAck: true });

    return {
        isConnected: () => connected,
        async search(query) {
            if (!connected) {
                throw new Error('Der Nährwert-Service ist nicht erreichbar.');
            }

            const correlationId = randomUUID();
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pending.delete(correlationId);
                    reject(new Error('Die Nährwertsuche hat zu lange gedauert.'));
                }, REQUEST_TIMEOUT_MS);
                pending.set(correlationId, { resolve, reject, timer });

                requestChannel.sendToQueue(
                    QUEUE_NAME,
                    Buffer.from(JSON.stringify({ query })),
                    {
                        correlationId,
                        replyTo: replyQueue,
                        contentType: 'application/json',
                        persistent: true
                    },
                    (error) => {
                        if (error) {
                            const request = pending.get(correlationId);
                            if (request) {
                                pending.delete(correlationId);
                                clearTimeout(request.timer);
                                request.reject(new Error('Die Nährwertsuche konnte nicht gestartet werden.'));
                            }
                        }
                    }
                );
            });
        },
        async close() {
            connected = false;
            await Promise.allSettled([requestChannel.close(), replyChannel.close(), connection.close()]);
        }
    };
}

module.exports = { createNutritionRpc };
