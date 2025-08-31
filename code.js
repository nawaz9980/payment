
const axios = require('axios');

const url = 'https://api.oxapay.com/v1/payment/static-address';

const data = {
   network: "TRON",
   to_currency: "USDT",
   auto_withdrawal: false,
   order_id: "ORD-12345",
   description: "Order #12345"
};

const headers = {
 'merchant_api_key': '5A7SXW-DDU0CV-TBBYXS-CXLMMV',
 'Content-Type': 'application/json',
};

axios.post(url, data, { headers })
 .then((response) => {
   console.log(response.data);
 })
 .catch((error) => {
   console.error(error);
 });