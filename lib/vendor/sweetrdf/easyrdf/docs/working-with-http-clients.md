# Working with HTTP-Clients

## Change timeout and other settings

```php
/**
 * Change the timeout setting for external requests
 *
 * @source https://github.com/NatLibFi/Skosmos/blob/main/src/model/resolver/LinkedDataResource.php
 */
$httpclient = EasyRdf\Http::getDefaultHttpClient();

//                  Set different timeout ----,
//                                            v
$httpclient->setConfig(array('timeout' => $timeout, 'useragent' => 'Skosmos'));
EasyRdf\Http::setDefaultHttpClient($httpclient);

$uri = 'https://your-sexy-triple-store';

$graph = EasyRdf\Graph::newAndLoad(EasyRdf\Utils::removeFragmentFromUri($uri));
```
