
import express from 'express'
import consentRoutes from "./routes/consentRoutes.js";
import tokenRoutes from "./routes/tokenRoutes.js";

const app = express()

app.use(express.json())

app.use("/consent", consentRoutes )
app.use("/token", tokenRoutes)

app.listen(3000, () => {
  console.log("Running on PORT 3000")
})