const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sou5t.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

app.use(cors());
app.use(express.json());

async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const servicesCollection = client.db('serviceReview').collection('services');
    const serviceApplicationCollection = client.db('serviceReview').collection('service-application');

    // Services API
    app.get('/services', async (req, res) => {
      const email = req.query.email;
      const search = req.query.search;

      let query = {};

      if (email) {
        query.userEmail = email;
      }

      if (search) {
        const searchRegex = new RegExp(search, 'i');
        query.$or = [
          { serviceTitle: searchRegex },
          { companyName: searchRegex },
          { category: searchRegex }
        ];
      }

      try {
        const cursor = servicesCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (err) {
        console.error('Error fetching services:', err);
        res.status(500).send({ error: 'Failed to fetch services' });
      }
    });

    app.get('/services/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.findOne(query);
      res.send(result);
    });

    app.post('/services', async (req, res) => {
      const newService = req.body;
      const result = await servicesCollection.insertOne(newService);
      res.send(result);
    });

    app.delete('/services/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await servicesCollection.deleteOne(query);
      res.send(result);
    });

    // Service Application APIs
    app.get('/service-application', async (req, res) => {
      const email = req.query.email;
      const query = { applicant_email: email };
      const result = await serviceApplicationCollection.find(query).toArray();

      const enrichedResults = await Promise.all(
        result.map(async (application) => {
          const serviceId = application.service_id;
          if (!serviceId) return application;

          try {
            const service = await servicesCollection.findOne({ _id: new ObjectId(serviceId) });
            if (service) {
              application.serviceTitle = service.serviceTitle;
              application.companyName = service.companyName;
              application.serviceImage = service.serviceImage;
              application.category = service.category;
              application.applicationCount = service.applicationCount || 0;
            } else {
              console.warn(`Service not found for ID: ${serviceId}`);
            }
          } catch (err) {
            console.error(`Error fetching service for ID ${serviceId}:`, err.message);
          }

          return application;
        })
      );

      res.send(enrichedResults);
    });

    app.get('/service-application/services/:service_id', async (req, res) => {
      const serviceId = req.params.service_id;
      console.log("Looking for applications for service ID:", serviceId);
      const query = { service_id: serviceId };
      const result = await serviceApplicationCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/service-application', async (req, res) => {
      const application = req.body;
      console.log('Application:', application);

      const serviceId = application.service_id;

      if (!serviceId) {
        return res.status(400).send({ error: 'Missing service_id in application.' });
      }

      const result = await serviceApplicationCollection.insertOne(application);

      const query = { _id: new ObjectId(serviceId) };
      const service = await servicesCollection.findOne(query);

      let newCount = 1;
      if (service && service.applicationCount) {
        newCount = service.applicationCount + 1;
      }

      await servicesCollection.updateOne(query, {
        $set: { applicationCount: newCount }
      });

      res.send(result);
    });

    app.patch('/service-application/:id', async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: data.status
        }
      };
      const result = await serviceApplicationCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete('/service-application/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceApplicationCollection.deleteOne(query);
      res.send(result);
    });

  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Service review System');
});

app.listen(port, () => {
  console.log(`Service review is wating: ${port}`);
});
