const keys = require('./keys');
const redis = require('redis');

const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  retry_strategy: () => 1000,
});
const sub = redisClient.duplicate();

function fib(index) {
  if (index < 2) return 1;
  return fib(index - 1) + fib(index - 2);
}


console.log('Worker started and waiting for jobs...');

function logAllValues() {
  redisClient.hgetall('values', (err, values) => {
    if (err) {
      console.error('Error fetching values from Redis:', err);
    } else {
      console.log('Current values in Redis:', values);
    }
  });
}

// Log all values at startup
console.log('Logging all values at startup:');
logAllValues();
console.log('-------------------------------------');
 
 
sub.on('message', (channel, message) => {
    console.log('Received message:', message);
    redisClient.hset('values', message, fib(parseInt(message)));
});
sub.subscribe('insert');
