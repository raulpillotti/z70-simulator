macro_rules! lock {
    ( $x:expr ) => {
        $x.lock().expect("Failed to get lock")
    };
}
