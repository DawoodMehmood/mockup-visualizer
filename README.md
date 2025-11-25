ssh root@179.61.219.12


sudo nano /etc/nginx/sites-available/3d.ruedaveloz.com



cd mockup-visualizer
git pull origin main
npm install
npm run build

sudo rm -rf /var/www/3d-app/*
sudo mkdir -p /var/www/3d-app
sudo cp -r dist/* /var/www/3d-app/

sudo systemctl reload nginx


sudo certbot --nginx -d 3d.ruedaveloz.com
