const https = require('https');
const AWS = require('aws-sdk');
const { loadImage, createCanvas } = require("canvas");
const fs = require('fs');

const rekognition = new AWS.Rekognition({
  credentials: {
    accessKeyId: "<your access key",
    secretAccessKey: "<your secret access key>",
    sessionToken: "<your session token>",
  }, region: 'us-east-1',
});

const s3 = new AWS.S3({
  credentials: {
    accessKeyId: "<your access key",
    secretAccessKey: "<your secret access key>",
    sessionToken: "<your session token>",
  }, region: 'us-east-1'
});

async function process(event) {
  for (let record of event.Records) {
    const { imgUrl, outputKey } = JSON.parse(record.body);
    const labels = await rekognize(imgUrl);
    const newImg = await annotateLabels(imgUrl, labels.Labels);
    await writeToS3(outputKey, newImg)

  }
  return true;
}


async function writeToS3(key, bytes) {
  await s3.putObject({
    Bucket: 'container-labo-03',
    Key: key,
    Body: bytes,
    ContentType: 'image/jpeg'
  }).promise()
}


async function rekognize(photoUrl) {
  const buffer = await getRequest(photoUrl);
  const request = rekognition.detectLabels({
    Image: { Bytes: buffer },
  });

  const response = await request.promise();
  return response;
}

function getRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      var data = [];
      res.on('data', chunk => {
        data.push(chunk)
      });
      res.on('end', () => {
        try {
          var buffer = Buffer.concat(data);
          resolve(buffer);
        } catch (err) {
          reject(new Error(err));
        }
      });
    });
    req.on('error', err => {
      reject(new Error(err));
    });
  });
}


exports.handler = process;


process({
  Records: [{
    body: '{"imgUrl":"https://images.unsplash.com/photo-1640622843377-6b5af9417e70?ixlib=rb-1.2.1&ixid=MnwxMjA3fDF8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1740&q=80", "outputKey":"laptop.jpg"}'
  }]
})


/**
 * 
 * @param {*} sourceImage: string url or Buffer 
 * @param {*} labels: array of Rekognition labels
 * @return buffer: jpeg image
 */
async function annotateLabels(sourceImage, labels) {
  const img = await loadImage(sourceImage);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  const fontSize = img.height / 30;
  ctx.drawImage(img, 0, 0);
  // apply rekognition
  for (let label of labels) {
    for (let instance of label.Instances) {
      ctx.strokeStyle = 'green';
      ctx.shadowColor = '#d53';
      ctx.shadowBlur = 20;
      ctx.lineJoin = 'bevel';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#38f';
      const { Width, Height, Left, Top } = instance.BoundingBox;
      ctx.strokeRect(Left * img.width, Top * img.height, Width * img.width, Height * img.height);
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = fontSize / 2;
      ctx.font = `italic ${fontSize.toFixed(0)}px Calibri`;
      ctx.fillStyle = 'black';
      const textMeasure = ctx.measureText(label.Name);
      ctx.fillText(label.Name, (Left + Width) * img.width - textMeasure.width, (Top + Height) * img.height);
    }
  }
  const buff = canvas.toBuffer('image/jpeg');
  return buff;
}