<?php

/**
 * GIT DEPLOYMENT SCRIPT
 *
 * Pulls the latest code from GitHub when this endpoint is hit.
 *
 * The full Rocky 9 LAMP pipeline (candidate verification, asset build,
 * database migrations, Node runtime handoff, deployment manifest) lives in
 * deploy-lamp.php.
 */
header('Content-Type: text/html; charset=UTF-8');

$output = shell_exec('cd ' . escapeshellarg(dirname(__DIR__)) . ' && git pull 2>&1');
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
            <pre><?php echo htmlentities(trim((string) $output)); ?></pre>
        </div>
    </div>
</body>

</html>
