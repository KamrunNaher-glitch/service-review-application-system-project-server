const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
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

app.use(cors({
  origin:['http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req,res,next) =>{
  const token = req.cookies?.token;
  if(!token) {
    return res.status(401).send({message:'unauthorized access'})
  }
  jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded) =>{
    if (err){
      return res.status(401).send({message:'unauthorized access'})
    }
    req.user = decoded;

    next();
  })
 
}


async function run() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const servicesCollection = client.db('serviceReview').collection('services');
    const serviceApplicationCollection = client.db('serviceReview').collection('service-application');

    // Auth Related API 
    app.post('/jwt',(req,res) =>{
      const user = req.body;
      const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{
        expiresIn: '1h' });
     res.cookie('token',token,{
      httpOnly:true,
      secure:false,
     })
     .send({success:true})
    });

    app.post('/logout',(req,res)=>{
      res.clearCookie('token',{
        httpOnly:true,
        secure: false
      })
      .send({success:true})
    })


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
    app.get('/service-application/:id',  async (req, res) => {
      const id = req.params.id;
      console.log("🔍 Requested ID:", id);
    
      try {
        const application = await servicesCollection.findOne({ _id: new ObjectId(id) });
    
        if (!application) {
          console.log("⚠️ No application found");
          return res.status(404).send({ message: 'Application not found' });
        }
    
        console.log("✅ Found application:", application);
    
        // if (req.user.email !== application.applicant_email) {
        //   console.log("⛔ Email mismatch:", req.user.email, application.applicant_email);
        //   return res.status(403).send({ message: 'Forbidden' });
        // }
    
        const service = await servicesCollection.findOne({ _id: new ObjectId(application.service_id) });
    
        if (service) {
          application.serviceTitle = service.serviceTitle;
          application.serviceImage = service.serviceImage;
          application.companyName = service.companyName;
          application.category = service.category;
        }
    
        res.send(application);
    
      } catch (err) {
        console.error('', err.message);
        res.status(500).send({ error: 'Internal server error' });
      }
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
