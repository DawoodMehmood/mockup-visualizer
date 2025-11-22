ssh root@179.61.219.12

cd mockup-visualizer
git pull origin main
npm install
npm run build

sudo rm -rf /var/www/html/*
sudo cp -r dist/* /var/www/html/

sudo systemctl restart nginx