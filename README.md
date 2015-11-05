Nodify Sample App [![Build Status](https://secure.travis-ci.org/microapps/Nodify-App.png?branch=master)](http://travis-ci.org/microapps/Nodify-App)
======================

This is a Shopify App using Nodify-Shopify module. This app provides the layout and the controllers to show orders and products.

### Installation

    git clone git@github.com:microapps/Nodify-App.git
    cd Nodify-App
    npm install -d
    
   
Create a config.json file and declare your API key and Shared Secret. 
	
	{
		"apiKey": "YOUR-API-KEY",
		"secret": "YOUR-SHARED-SECRET"
	}

If you don't have the API key and Shared Secret yet, sign up for a [Shopify Partner account](https://app.shopify.com/services/partners/signup/?ref=microapps), and create your first app. You can also create test stores
once you're logged in as a partner.

When you create your app in the Shopify Partner Account, set the return URL to
<tt>localhost:3000/login/finalize</tt>

Start your local application: 

    node app.js

Head over to: <tt>localhost:3000</tt> and enter the url of your Shopify store.

After your application has been given read or read/write API permission by your Shopify store, you're ready to see how Nodify works. It's time to tweak it!

## Become a master of the Shopify ecosystem by: 

* [Becoming a Shopify App Developer] (https://app.shopify.com/services/partners/signup?ref=microapps)
* [Checking out the roots] (http://docs.shopify.com/api/the-basics/getting-started?ref=microapps) 
* [Talking To Other Masters] (http://ecommerce.shopify.com/c/shopify-apps?ref=microapps) 
* [Reading API Docs] (http://docs.shopify.com/api?ref=microapps) 
* [Learning from others] (http://stackoverflow.com/questions/tagged/shopify) 


## Contributors:
[Carlos Villuendas] (https://github.com/carlosvillu/)

[Kenrick Beckett] (https://github.com/kenrick/)

[Florian Traverse] (https://github.com/temsa/)

[Alexandre Saiz] (https://github.com/alexandresaiz/)

Supported by [microapps](http://www.shopfrogs.com/shopify/)


## License 

(The MIT License)

Copyright (c) 2012-2014 [microapps](http://www.shopfrogs.com/shopify/) &lt;hi@microapps.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
