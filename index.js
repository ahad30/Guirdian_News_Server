const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://the-guirdian-news.netlify.app"
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


    const articleCollection = client.db("guirdianNews").collection("articles");
    const userCollection = client.db("guirdianNews").collection("users");
    const publisherCollection = client.db("guirdianNews").collection("publisher");
    const feedbackCollection = client.db("guirdianNews").collection("feedback");
    const paymentCollection = client.db("guirdianNews").collection("subscription");
 
    

    // const index = { itemName: 1, brandName: 1 }
    // const indextOptions = { name: "ProductName" }
    // const result = await productQueryCollection.createIndex(index, indextOptions)



    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d' });
      res.send({ token });
    })

    // middlewares 
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      // console.log(req.headers.authorization)
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


    //Admin User Section Api

    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });


    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });


    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
       
        if (email !== req.decoded.email) {
          return res.status(403).send({ message: 'forbidden access' })
        }

        
        const user = await userCollection.findOne({ email: email });
    
        let admin = false;
        if (user) {
          admin = user?.role === 'admin';
        }
        res.send({ admin });
      }
      catch (error) {
        res.status(404).send({ error: 'no user found' })
      }
    })


    app.post('/users', async (req, res) => {
      const user = req.body;

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


    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })



    // All Article APi
     

    app.get("/articleSearch", async (req, res) => {
      try {
        const searchText = req.query.search || "";
        const filter = req.query.filter || "";
        const publishFilter = req.query.publisherFilter || "";
        //  console.log(publishFilter)

        let query = {
          title: { $regex: searchText, $options: 'i' },
        };

        if (filter) {
          query['tags.label'] = filter;
        }
        if (publishFilter) {
          query['publisher.label'] = publishFilter;
        }
    
        // console.log("Query:", query);
        const result = await articleCollection.find(query).toArray();
        res.send({ result });
      } catch (error) {
        res.status(404).send({ error });
      }
    });
    


    app.get('/allArticles',  async (req, res) => {
      try {
        const result = await articleCollection.aggregate([
          {
            $lookup: {
              from: 'users',
              localField: 'userEmail',
              foreignField: 'email',
              as: 'user',
            },
          },
          {
            $unwind: '$user',
          },
          {
            $project: {
              _id: 1,
              title: 1,
              description: 1,
              deadline: 1,
              isPremium: 1,
              tags: 1,
              publisher: 1,
              photo: 1,
              status: 1,
              image: 1,
              user: {
                _id: 1,
                email: 1,
                name: 1,
                subscription: 1,
                isChange: 1,
                role: 1,
              },
            },
          },
        ]).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
     });


    app.get('/articleDetails/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await articleCollection.findOne(query);
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })


    // For Admin All Article
    

    app.get('/allArticle', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await articleCollection.aggregate([
          {
            $lookup: {
              from: 'users',
              localField: 'userEmail',
              foreignField: 'email',
              as: 'user',
            },
          },
          {
            $unwind: '$user',
          },
          {
            $project: {
              _id: 1,
              title: 1,
              description: 1,
              deadline: 1,
              isPremium: 1,
              tags: 1,
              publisher: 1,
              photo: 1,
              status: 1,
              image: 1,
              user: {
                _id: 1,
                email: 1,
                name: 1,
                subscription: 1,
                isChange: 1,
                role: 1,
              },
            },
          },
        ]).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });
    
    app.get('/articles/countByPublisher', async (req, res) => {
      try {
        const result = await articleCollection.aggregate([
          {
            $group: {
              _id: "$publisher.label",
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              publisher: "$_id",
              count: 1
            }
          }
        ]).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "something went wrong", error: error.message });
      }
    });


    app.patch('/articleStatus/:id',verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id
      const status = req.body
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: status,
      }
      const result = await articleCollection.updateOne(query, updateDoc)
      res.send(result)
    })


    app.patch('/articlePremium/:id',verifyToken,verifyAdmin, async (req, res) => {
     try{
      const id = req.params.id
      const isPremium = req.body
      console.log(isPremium)
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: isPremium
      }
      const result = await articleCollection.updateOne(query, updateDoc)
      res.send(result)
     }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })

   
  
    // User Article Api

    app.get("/myArticleList/:email", verifyToken, async (req, res) => {
      try {
        // const tokenEmail = req.user.email
        const email = req.params.email
        // if (tokenEmail !== email) {
        //   return res.status(403).send({ message: 'forbidden access' })
        // }              
        const result = await articleCollection.find({userEmail: email }).sort({ _id: -1 }).toArray();
        res.send(result)
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })



    app.post('/addArticle', async (req, res) => {
      try {
        const article = req.body;
        const result = await articleCollection.insertOne({...article, viewCount: 0});
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })


    app.put('/updateArticle/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const options = { upsert: true };
      const updatedItem = req.body;
      const item = {
        $set: {
          ...updatedItem
        }
      }
      const result = await articleCollection.updateOne(filter, item, options);
      res.send(result);
    })

    app.delete('/deleteArticle/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }
        const result = await articleCollection.deleteOne(query);
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })



    //  Publisher Api
    app.post('/addPublisher', async (req, res) => {
      try {
        const publisher = req.body;
        console.log(publisher);
        const result = await publisherCollection.insertOne(publisher);
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })   
      
    app.get('/publishers',  async (req, res) => {
     try{
      const result = await publisherCollection.find().toArray();
      res.send(result);
     }
     catch (error) {
      res.status(500).send({ message: "some thing went wrong" })
    }
    });



    //Admin feedback section

  app.post('/addFeedback', async (req, res) => {
      try {
        const feedback = req.body;
        console.log(feedback);
        const result = await feedbackCollection.insertOne(feedback);
        res.send(result);
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })

    app.get("/myArticleReason/:email/:id", verifyToken, async (req, res) => {
      try {
        const email = req.params.email              
        const id = req.params.id  
        console.log(id)            
        const result = await feedbackCollection.find({userEmail: email , articleId : id }).toArray();
        // console.log(result)
        res.send(result)
      }
      catch (error) {
        res.status(500).send({ message: "some thing went wrong" })
      }
    })


  // Article Views Section

app.patch('/incrementViewCount/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const query = { _id: new ObjectId(id) };
    const updateDoc = {
      $inc: { viewCount: 1 }
    };
    const result = await articleCollection.updateOne(query, updateDoc);
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Something went wrong' });
  }
});


app.get('/trendingArticles', async (req, res) => {
  try {
    const result = await articleCollection.find().sort({ viewCount: -1 }).limit(6).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: 'Something went wrong' });
  }
});





// Payment Intent
app.post('/create-payment-intent', async (req, res) => {
  const { price } = req.body;
  const amount = parseInt(price * 100);
  console.log(amount, 'amount inside the intent')

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount,
    currency: 'usd',
    payment_method_types: ['card']
  });

  res.send({
    clientSecret: paymentIntent.client_secret
  })
});


app.get('/payments/:email', verifyToken, async (req, res) => {
  const query = { email: req.params.email }
  if (req.params.email !== req.decoded.email) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  const result = await paymentCollection.find(query).toArray();
  res.send(result);
})


app.post('/payments', async (req, res) => {
  const payment = req.body;
  const paymentResult = await paymentCollection.insertOne(payment);

  //  carefully delete each item from the cart
  console.log('payment info', payment);
  // const query = {
  //   _id: {
  //     $in: payment.cartIds.map(id => new ObjectId(id))
  //   }
  // };

  // const deleteResult = await cartCollection.deleteMany(query);

  res.send({ paymentResult });
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