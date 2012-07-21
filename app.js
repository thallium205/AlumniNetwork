var application_root = __dirname,
    express = require("express"),
    path = require("path"),
    neo4j = require('neo4j'),
	fs = require('fs');

// Database
var db = new neo4j.GraphDatabase('http://localhost:7474');

// Config
var app = express.createServer();
app.configure(function () {
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(application_root, "public")));
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

// API
app.get('/', function(req, res){
  res.render('index.jade', { title: 'Alumni Network' });
});

// Load database
app.get('/load/:id', function(req, res)
{	
	if (req.params.id === 'apple123')
	{
		fs.readFile('alumni.csv', 'utf8', function(err, data) 
		{
			if (err) 
			{
				res.render('index.jade', {title: 'Unable to open alumni.csv'});
				return console.log(err);
			}	
			
			// Parse CSV		
			var alumni = parseCsv(data, ',');
			var people = [];
			for (var i = 0; i < alumni.length; i++)
			{
				var person = 
				{
					'guid': alumni[i][0],
					'last': alumni[i][1],
					'first': alumni[i][2],
					'email': alumni[i][3],
					'year': alumni[i][4]
				};
				
				people.push(person);
			}		
			
			// Get unique class years
			var years = {};
			for (var i = 0; i < people.length; i++)
			{				
				years[people[i]] = people[i].year;
			}			
			
			
			// DEBUGGING
			console.log("Begin test");
			db.getServices(function(err, result)
			{
				if (err)
				{
					return console.log(err);
				}
				console.log(result);
			});
			
			
			// Add class years to database if they don't exist
			for (var year in years)
			{			
				console.log("Processing year: " + years[year]);
				db.getIndexedNodes('years', 'year', years[year].toString(), function(err, result)
				{
					if (err)
					{
						return console.log(err);
					}
					
					if (result === null)
					{
						// It doesn't exist.  Add the year to the database
						console.log("IT DOESNT EXIST LOLOL");
						var node = db.createNode({'year': years[year]});
						node.save(function callback(err, result)
						{
							if (err)
							{
								return console.log(err);
							}
							
							// Create relationship from class to class
							if (years[year] === 1991)
							{
								// This is the first class, so add a relationship to the reference node
								db.getNodeById(0, function(err, result)
								{
									if (err)
									{
										return console.log(err);
									}
									
									result.createRelationshipTo(node, 'follows', function(err, result)
									{
										if (err)
										{
											return console.log(err);
										}										
									});
								});
							}
							else
							{
								// Create a relationship to the previous year
								db.getIndexedNodes('years', 'year', years[year] - 1, function(err, result)
								{
									if (err)
									{
										res.send(err);
										return console.log(err);
									}

									result.createRelationshipTo(node, 'follows', function(err, result)
									{
										if (err)
										{
											return console.log(err);
										}
									});
								});
							}							
						});					
					}
				});
			}
			
			// Add people to the database if they don't exist			
			for (var person in people)
			{
				db.getIndexedNodes('people_guids', 'person_guid', people[person].guid, function(err, result)
				{
					if (err)
					{
						return console.log(err);
					}
					
					if (result != null)
					{
						// Person has not been added
						var node = db.createNode(people[person]);
						// Save the person						
						node.save(function callback(err, result) 
						{
							if (err)
							{
								return console.log(err);
							}
							
							// Create the relationship from the person to the class
							db.getIndexedNodes('years', 'year', people[person].year, function(err, result)
							{
								node.createRelationshipTo(result, 'class_of', function callback(err, result)
								{
									if (err)
									{
										return console.log(err);
									}		
								});
							});
							
							// Create index
							node.index('people_guids', 'person_guid', people[person].guid, function(err, result)
							{
								if (err)
								{
									return console.log(err);
								}	
							});							
						});
					}
				});
			}				
		});
	}	
	else
	{
		res.render('index.jade', { title: 'Intruder!'});
	}
});	

// Return a user
app.get('/user/:id', function (req, res) 
{
	res.render('index.jade', { title: req.params.id});
});

// Save a user

// Make 




// Internal functions
// Parse CSV
function parseCsv(s, sep)
{	var universalNewline = /\r\n|\r|\n/g;
	var a = s.split(universalNewline);
    for(var i in a)
	{
		for (var f = a[i].split(sep = sep || ","), x = f.length - 1, tl; x >= 0; x--) 
		{
			if (f[x].replace(/"\s+$/, '"').charAt(f[x].length - 1) == '"') 
			{
				if ((tl = f[x].replace(/^\s+"/, '"')).length > 1 && tl.charAt(0) == '"') 
				{
					f[x] = f[x].replace(/^\s*"|"\s*$/g, '').replace(/""/g, '"');
				} 
				
				else if (x)
				{
					f.splice(x - 1, 2, [f[x - 1], f[x]].join(sep));
				} 
				
				else f = f.shift().split(sep).concat(f);
				
			} 
			
			else f[x].replace(/""/g, '"');
		} 
		a[i] = f;
	}
	return a;
}


// Launch server
app.listen(3000, function(){
  console.log('Server running');
});