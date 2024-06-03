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
    const recommendQueryCollection = client.db('productQueriesDB').collection('recommendQuery');

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


    // Recommend Section

    app.put('/addComment/:id', async (req, res) => {
      const id = req.params.id;
      const recommendationData = req.body;

      try {
        const result = await productQueryCollection.updateOne(
          { _id: new ObjectId(id) },
          { $push: { recommended: recommendationData } }
        );

        console.log(result);
        res.send({ result: result });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'An error occurred while adding the comment.' });
      }
    });


    app.get('/myRecommend/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const result = await productQueryCollection.find({ 'recommended.userEmail': email }).toArray();
        console.log(result)
        const userRecommendations = result.map(item => ({
          ...item,
          recommended: item.recommended.filter(recommendation => recommendation.userEmail === email)
        }));
        res.send(userRecommendations);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'An error occurred while fetching recommendations.' });
      }
    })
    

    app.delete('/deleteQueryItem/:id/:recommendationId/:email', async (req, res) => {
      try {
        const id = req.params.id;
        const recommendationId = req.params.recommendationId;
        const email = req.params.email;
    
        const query = { _id: new ObjectId(id) };
    
        // Remove the targeted recommendation from the query document
        const result = await productQueryCollection.updateOne(
          query,
          { $pull: { recommended: { _id: new ObjectId(recommendationId), userEmail: email } } }
        );
    
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "something went wrong" });
      }
    });
    
    


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