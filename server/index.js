const keys = require('./keys');

//Express app setup
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

//Postgres Client Setup
const { Pool } = require('pg');
const pgClient = new Pool({
    user: keys.pgUser,
    host: keys.pgHost,
    database: keys.pgDatabase,
    password: keys.pgPassword,
    port: keys.pgPort,
    ssl:
        process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false
});

pgClient.on("connect", (client) => {
    client
        .query("CREATE TABLE IF NOT EXISTS values (number INT)")
        .catch((err) => console.error(err));
});

//Redis Client Setup
const redis = require('redis');
console.log('Redis host:', keys.redisHost);
console.log('Redis port:', keys.redisPort);
const redisClient = redis.createClient({
    host: keys.redisHost,
    port: keys.redisPort,
    retry_strategy: () => 1000
});
console.log('Redis client setup end');
redisClient.on('connect', () => {
    console.log('*** REDIS: Successfully connected to the Redis host! ***');
});
redisClient.on('error', (err) => {
    // If you see this, the connection failed. The error object (err) will give details.
    console.error('*** REDIS ERROR: Connection failed ***', err); 
});
const redisPublisher = redisClient.duplicate();

//Express route handlers

app.get('/', (req, res) => {
    res.send('Hi');
});

app.get('/values/all', async (req, res) => {
    const values = await pgClient.query('SELECT * from values');
    
    res.send(values.rows);
});

//app.get('/values/current', async (req, res) => {
//    console.log('Fetching values from Redis:');
//    redisClient.hgetall('values', (err, values) => {
//        res.send(values);
//    });
//    console.log('Fetching values from Redis: DONE');
//});
app.get('/values/current', (req, res) => {
    console.log('Fetching values from Redis: START'); // Log 1: Start time

    // **CRITICAL IMPROVEMENT:** Explicit error handling in the callback
    redisClient.hgetall('values', (err, values) => {
        if (err) {
            console.error('--- REDIS HGETALL ERROR ---'); // Log 2: Error flag
            console.error(err); // Log 3: Full error details (e.g., Command Timeout, Auth failure)
            return res.status(500).send({ error: 'Redis command failed', details: err.message });
        }
        
        console.log('Fetching values from Redis: SUCCESS'); // Log 4: Success confirmation
        res.send(values);
    });
    // Removed the misleading 'DONE' log which executed before the callback
});

app.post('/values', async (req, res) => {
    const index = req.body.index;

    if (parseInt(index) > 40) {
        return res.status(422).send('Index too high');
    }
    
    // Redis Write (HSET) with Logging
    redisClient.hset('values', index, 'Nothing yet!', (err, reply) => {
        if (err) {
            console.error(`REDIS HSET FAILURE for index ${index}:`, err);
        } else {
            console.log(`REDIS HSET SUCCESS for index ${index}. Reply: ${reply}`);
        }
    });
    
    // Redis Publish with Logging
    redisPublisher.publish('insert', index, (err) => {
        if (err) {
            console.error(`REDIS PUBLISH FAILURE for index ${index}:`, err);
        } else {
            console.log(`REDIS PUBLISH SUCCESS for index ${index}.`);
        }
    });

    // CRITICAL IMPROVEMENT: Await the DB query to catch immediate errors
    try {
        await pgClient.query('INSERT INTO values(number) VALUES($1)', [index]);
        console.log(`PG INSERT SUCCESS for index ${index}.`);
    } catch (err) {
        console.error(`PG INSERT FAILURE for index ${index}:`, err);
        return res.status(500).send({ error: 'PostgreSQL insertion failed' });
    }
    
    res.send({ working: true, index: index });
});

app.listen(5000, err => {
    console.log('Listening');
});
