import express from 'express'
import session from 'express-session'
import multer from 'multer'
import crypto from 'crypto'
import cors from 'cors'
import imagemin from 'imagemin'
import imageminPngquant from 'imagemin-pngquant'
import fs from 'fs'
import * as url from 'url'
import path from 'path'

const app = express()

const UPLOADS_DIR = './uploads'
const OPTIMIZED_DIR = './optimized'

fs.mkdirSync(UPLOADS_DIR, { recursive: true })
fs.mkdirSync(OPTIMIZED_DIR, { recursive: true })

app.use(cors())
app.use(express.static('./'))

app.use(
	session({
		secret: 'secret-key',
		resave: false,
		saveUninitialized: true,
	})
)

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		const userSessionDir = path.join(UPLOADS_DIR, req.session.id)
		fs.mkdirSync(userSessionDir, { recursive: true })
		cb(null, userSessionDir)
	},
	filename: function (req, file, cb) {
		cb(null, file.originalname)
	},
})

const upload = multer({ storage })

app.post('/upload', upload.single('file'), async (req, res, next) => {
	const filename = req.file.filename
	const userSessionDir = `${UPLOADS_DIR}/${req.session.id}`

	await fs.promises.mkdir(userSessionDir, { recursive: true })

	const filePath = `${userSessionDir}/${filename}`
	const hash = crypto.createHash('md5')
	const input = fs.createReadStream(filePath)

	input.on('readable', async () => {
		const data = input.read()

		if (data) {
			hash.update(data)
		}
	})

	input.on('end', async () => {
		const newFilename = hash.digest('hex')
		const ext = req.file.originalname.split('.').pop()
		const newFilePath = path.join(userSessionDir, `${newFilename}.${ext}`)

		fs.renameSync(filePath, newFilePath)

		const optimizedUserSessionDir = path.join(OPTIMIZED_DIR, req.session.id)

		await fs.promises.mkdir(optimizedUserSessionDir, { recursive: true })

		const optimizedFilePath = path.join(optimizedUserSessionDir, `${newFilename}.${ext}`)

		await imagemin([newFilePath], {
			destination: optimizedUserSessionDir,
			plugins: [
				imageminPngquant({
					speed: 4,
					strip: true,
					dithering: 1,
					posterize: 1,
				}),
			],
		})

		const stats = await fs.promises.stat(optimizedFilePath)
		const fileSizeInBytes = stats.size

		res.send({
			filename: `${newFilename}.${ext}`,
			fileSizeInBytes,
		})
	})
})

app.use((err, req, res, next) => {
	console.error(err.stack)
	res.status(500).send({ error: 'Something broke!' })
})

app.listen(5001, () => {
	console.log('Server is running on port 5001')
})
