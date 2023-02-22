import express from 'express'
import multer from 'multer'
import crypto from 'crypto'
import cors from 'cors'
import imagemin from 'imagemin'
import imageminPngquant from 'imagemin-pngquant'
import fs from 'fs'
import * as url from 'url'

const app = express()
const upload = multer({ dest: 'uploads/' })

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

app.use(cors())
app.use(express.static(__dirname))

app.post('/upload', upload.single('file'), async (req, res, next) => {

	const filename = req.file.filename
	const filePath = `uploads/${filename}`
	const hash = crypto.createHash('md5')
	const input = fs.createReadStream(filePath)

	input.on('readable', async () => {

		const data = input.read()

		if (data) {
			hash.update(data)
		} else {

			const newFilename = hash.digest('hex')
			const ext = req.file.originalname.split('.').pop()
			const newFilePath = `uploads/${newFilename}.${ext}`

			fs.renameSync(filePath, newFilePath)

			const optimizedFilePath = `optimized/${newFilename}.${ext}`

			await imagemin([newFilePath], {
				destination: 'optimized',
				plugins: [
					imageminPngquant({
						speed: 4,
						strip: true,
						dithering: 1,
						posterize: 1,
					}),
				],
			})

			res.send({ filename: `${newFilename}.${ext}` })
		}
	})
})

app.listen(5001)
