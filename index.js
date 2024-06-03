const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://assignment-11-ahad.netlify.app",
    "https://ahad-product-query.web.app",
    "https://ahad-product-query.firebaseapp.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
}


// middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser())




const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qxclpw1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const productQueryCollection = client.db('productQueriesDB').collection('productQuery');
    
    const userCollection = client.db("guirdianNews").collection("users");
    


    // const index = { itemName: 1, brandName: 1 }
    // const indextOptions = { name: "ProductName" }
    // const result = await productQueryCollection.createIndex(index, indextOptions)



       // jwt related api
       app.post('/jwt', async (req, res) => {
        const user = req.body;
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
        res.send({ token });
      })
  
      // middlewares 
      const verifyToken = (req, res, next) => {
        // console.log('inside verify token', req.headers.authorization);
        if (!req.headers.authorization) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        const token = req.headers.authorization.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
          if (err) {
            return res.status(401).send({ message: 'unauthorized access' })
          }
          req.decoded = decoded;
          next();
        })
      }
  
      // use verify admin after verifyToken
      const verifyAdmin = async (req, res, next) => {
        const email = req.decoded.email;
        const query = { email: email };
        const user = await userCollection.findOne(query);
        const isAdmin = user?.role === 'admin';
        if (!isAdmin) {
          return res.status(403).send({ message: 'forbidden access' });
        }
        next();
      }
  

      // User Section

      app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
        const result = await userCollection.find().toArray();
        res.send(result);
      });
  
      app.get('/users/admin/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
  
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: 'forbidden access' })
        }
  
        const query = { email: email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user?.role === 'admin';
        }
        res.send({ admin });
      })


      app.post('/users', async (req, res) => {
        const user = req.body;
        // insert email if user doesnt exists: 
        // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
        const query = { email: user.email }
        const existingUser = await userCollection.findOne(query);
        if (existingUser) {
          return res.send({ message: 'user already exists', insertedId: null })
        }
        const result = await userCollection.insertOne(user);
        res.send(result);
      });

     
      app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: 'admin'
          }
        }
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      })





    app.get("/products", async (req, res) => {
      try {
        const searchText = req.query.search
        console.log(searchText)
        const result = await productQueryCollection.find({
          $or: [
            { itemName: { $regex: searchText, $options: "i" } },
            { brandName: { $regex: searchText, $options: "i" } }
          ]
        }).toArray()
        res.send({ result })
      } catch (error) {
        res.status(404).send({ error })
      }
    })


    app.get('/getSingleQuery', async (req, res) => {
      try {
        const cursor = productQueryCollection.find().sort({ _id: -1 });
        const result = await cursor.toArray();
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })

     
    app.get('/queryDetails/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await productQueryCollection.findOne(query);
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })



    app.get("/mySingleQuery/:email", async (req, res) => {
      try {
        // const tokenEmail = req.user.email
        const email = req.params.email
        // if (tokenEmail !== email) {
        //   return res.status(403).send({ message: 'forbidden access' })
        // }              
        const result = await productQueryCollection.find({ 'posterInfo.userEmail': email }).sort({ _id:-1}).toArray();
        console.log(result)
        res.send(result)
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }

    })



    app.post('/addSingleQuery', async (req, res) => {
      try {
        const newProduct = req.body;
        console.log(newProduct);
        const result = await productQueryCollection.insertOne({ ...newProduct, recommended: [] });
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })


    app.put('/updateQueryItem/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedItem = req.body;
      const item = {
        $set: {
          ...updatedItem
        }
      }

      const result = await productQueryCollection.updateOne(filter, item, options);
      res.send(result);
    })

    app.delete('/deleteQueryItem/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await productQueryCollection.deleteOne(query);
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })




    

    
    
    


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
                                  

app.get('/', (req, res) => {
  res.send('The Gurirdian  server')
})

app.listen(port, () => {
  console.log(`The Gurirdian News Server is running on port: ${port}`)
})