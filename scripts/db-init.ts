import { getServerEnv } from '../src/server/env.server'
import { verifyAndCreateIndexes } from '../src/server/db/index-verifier'
import { createMongoClient } from '../src/server/db/mongo-client'

const environment = getServerEnv()
const mongoClient = createMongoClient({ environment })

try {
  const database = await mongoClient.connect()
  const verification = await verifyAndCreateIndexes(database)
  const created = verification.filter((index) => index.status === 'created')
  const verified = verification.filter((index) => index.status === 'verified')

  console.log(
    JSON.stringify({
      status: 'ready',
      database: environment.databaseName,
      indexes: {
        created: created.length,
        verified: verified.length,
        total: verification.length,
      },
    }),
  )
} catch (error) {
  if (error instanceof Error && 'code' in error) {
    console.error(error.message)
  } else {
    console.error('MONGO_DB_INIT_FAILED')
  }
  process.exitCode = 1
} finally {
  await mongoClient.close()
}
