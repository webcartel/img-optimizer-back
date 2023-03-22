import express from 'express'
import session from 'express-session'
import multer from 'multer'
import crypto from 'crypto'
import cors from 'cors'
import bodyParser from 'body-parser'
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

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.use(
	session({
		secret: 'secret-key',
		resave: false,
		saveUninitialized: true,
	})
)

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		if (!req.body?.token) {
			const error = new Error()
			error.code = 400
			return cb(error)
		}

		const userSessionDir = path.join(UPLOADS_DIR, req.body.token)
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
	const userSessionDir = `${UPLOADS_DIR}/${req.body.token}`

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

		const optimizedUserSessionDir = path.join(OPTIMIZED_DIR, req.body.token)

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

app.get('/download/:token/:filename/:realfilename', function (req, res) {
	res.download(`./optimized/${req.params.token}/${req.params.filename}`, req.params.realfilename)
})

app.post('/delete', function (req, res, next) {
	if (req.body.token && req.body.filename) {
		const uploadedFilePath = `${UPLOADS_DIR}/${req.body.token}/${req.body.filename}`
		const optimizedFilePath = `${OPTIMIZED_DIR}/${req.body.token}/${req.body.filename}`

		const uploadedFileExists = fs.existsSync(uploadedFilePath)
		const optimizedFileExists = fs.existsSync(optimizedFilePath)

		if (!uploadedFileExists && !optimizedFileExists) {
			return res.status(404).json({ message: 'File not found' })
		}

		const promises = []

		if (uploadedFileExists) {
			promises.push(fs.promises.unlink(uploadedFilePath))
		}

		if (optimizedFileExists) {
			promises.push(fs.promises.unlink(optimizedFilePath))
		}

		Promise.all(promises)
			.then(() => {
				res.status(200).json({ ...req.body })
			})
			.catch((err) => {
				console.error(err)
				res.status(500).json({ message: 'Server error' })
			})
	} else {
		res.status(400).send()
	}
})

app.use(function (err, req, res, next) {
	if (err) {
		res.status(err.code).send()
	} else {
		next()
	}
})

app.listen(5001, () => {
	console.log('Server is running on port 5001')
})
