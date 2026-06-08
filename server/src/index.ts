import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => c.text('Manufacturing Platform — Server'))

export default app
