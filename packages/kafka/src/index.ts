export {
  createKafkaClient,
  initKafka,
  getKafka,
  type KafkaClientConfig,
} from './client.js';

export {
  getProducer,
  disconnectProducer,
  publishEvent,
  publishBatch,
} from './producer.js';

export {
  createConsumer,
  disconnectConsumer,
  type ConsumerConfig,
  type MessageHandler,
  type ConsumerHandler,
} from './consumer.js';
