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
	if (req.params.id === 'apple123') // Use pw file for production
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
				years[people[i].year] = people[i].year;
			}	

			// Sort the years
			var sortedYears = [];
			for (var year in years)
			{
				sortedYears.push(years[year]);
			}
			sortedYears.sort();	
			years = sortedYears;

			addAllyears(years, function(err)
			{
				if (err)
				{
					return console.log(err);
				}
				
				addAllPeople(people, function(err)
				{
					if (err)
					{
						return console.log(err);
					}
					
					res.send('Added: \n' + JSON.stringify(years) + '\n\n' + JSON.stringify(people));					
				});				
			});						
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

// Adds all the class years to the database and creates their relationships
function addAllyears(years, callback)
{
	// Counts how many years have been completed
	var yearsCompleted = 0;
	// Add class years to database		
	var yearNodes = [];
	for (var year in years)
	{				
		createYearNode({'year': years[year]}, function(err, result)
		{
			if (err)
			{
				return callback(err);
			}			
			yearNodes.push(result);				
			
			if (yearNodes.length == years.length)
			{
				yearNodes.sort(yearNodeCompare);
				// All years have been added. Create relationships
				for (i = 0; i < yearNodes.length; i++)
				{
					if (i == 0)
					{
						db.getNodeById(0, function(err, ref)
						{
							ref.createRelationshipTo(yearNodes[0], 'follows', {}, function(err)
							{
								if (err)
								{									
									return callback(err);
								}
								
								yearsCompleted ++;
								if (yearsCompleted == years.length)
								{
									return callback(null);
								}
								
							});
						});
					}
					
					else
					{
						yearNodes[i-1].createRelationshipTo(yearNodes[i], 'follows', {}, function(err)
						{
							if (err)
							{
								return callback(err);
							}
							
							yearsCompleted ++;
							if (yearsCompleted == years.length)
							{
								return callback(null);
							}
						});
					}
				}
			}			
		});	
	}
}

// Adds all the people to the database and creates their relationships to the classes
function addAllPeople(people, callback)
{
	// Counts how many years have been completed
	var peopleCompleted = 0;
	
	// Add people to database
	for (var person in people)
	{
		createPersonNode(people[person], function(err, personNode, year)
		{
			if (err)
			{
				return callback(err);
			}
			
			createPersonRel(personNode, year, function(err)
			{
				if (err)
				{
					return callback(err);
				}
				
				peopleCompleted ++;
				if (peopleCompleted == people.length)
				{	
					return callback(null);
				}
			});
		});				
	}
}
// Add year and index
function createYearNode(year, callback)
{
	var node = db.createNode(year);
	node.save(function (err)
	{
		if (err)
		{
			return callback(err);
		}
		
		node.index('years', 'year', year.year, function(err)
		{
			if (err)
			{
				return callback(err);
			}
			callback(null, node);
		});
	});
}

// Add person and index
function createPersonNode(person, callback)
{
	var node = db.createNode({'guid': person.guid, 'first': person.first, 'last': person.last, 'email': person.email});
	node.save(function (err)
	{
		if (err)
		{
			return callback(err);
		}
		
		node.index('persons', 'person', person.guid, function(err)
		{
			if (err)
			{
				return callback(err);
			}
			callback(null, node, person.year);
		});
	});
}

function createPersonRel(personNode, personYear, callback)
{
	db.getIndexedNode('years', 'year', personYear, function(err, node)
	{
		personNode.createRelationshipTo(node, 'graduated_in', {}, function(err)
		{
			if (err)
			{
				return callback(err);
			}
			
			return callback(null);
		});
	});	
}

function yearNodeCompare(a,b) 
{
	if (a.data.year < b.data.year)
		return -1;
	if (a.data.year > b.data.year)
		return 1;
	return 0;
}

// Launch server
app.listen(3000, function(){
  console.log('Server running');
});