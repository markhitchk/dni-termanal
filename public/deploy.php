<?php

/**
 * GIT DEPLOYMENT SCRIPT
 *
 * Pulls the latest code from GitHub when this endpoint is hit.
 */
$output = shell_exec('cd ../../; git pull 2>&1');
?>

<!DOCTYPE HTML>
<html lang="en-US">

<head>
    <meta charset="UTF-8">
    <title>GIT DEPLOYMENT SCRIPT</title>
</head>

<body style="background-color: #000000; color: #FFFFFF; font-weight: bold; padding: 0 10px;">
    <div style="width:700px">
        <div style="float:left;width:350px;">
            <p style="color:white;">Git Deployment Script</p>
            <pre><?php echo htmlentities(trim($output)); ?></pre>
        </div>
    </div>
</body>

</html>